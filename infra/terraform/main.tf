data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"] # Canonical
  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*"]
  }
}

# ---------- Container registry ----------
resource "aws_ecr_repository" "app" {
  for_each             = toset(["chat-backend", "chat-frontend"])
  name                 = each.key
  force_delete         = true
  image_tag_mutability = "MUTABLE"
  image_scanning_configuration {
    scan_on_push = true
  }
}

# ---------- Kubernetes node (k3s on EC2) ----------
resource "aws_security_group" "k3s" {
  name        = "${var.project}-k3s"
  description = "k3s node: web traffic, SSH and Kubernetes API"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    description = "HTTP (Traefik ingress)"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  ingress {
    description = "SSH"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [var.admin_cidr]
  }
  ingress {
    description = "Kubernetes API (kubectl / GitHub Actions)"
    from_port   = 6443
    to_port     = 6443
    protocol    = "tcp"
    cidr_blocks = [var.admin_cidr]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# Fixed public IP so the kubeconfig and TLS certificate survive instance stop/start
resource "aws_eip" "k3s" {
  domain = "vpc"
}

resource "aws_instance" "k3s" {
  ami                    = data.aws_ami.ubuntu.id
  instance_type          = var.instance_type
  key_name               = var.key_name
  vpc_security_group_ids = [aws_security_group.k3s.id]
  subnet_id              = data.aws_subnets.default.ids[0]

  root_block_device {
    volume_size = 30
    volume_type = "gp3"
  }

  # k3s ships with metrics-server (needed by the HPA), Traefik ingress and local-path storage
  user_data = templatefile("${path.module}/k3s-userdata.sh", { public_ip = aws_eip.k3s.public_ip })

  tags = { Name = "${var.project}-k3s" }
}

resource "aws_eip_association" "k3s" {
  instance_id   = aws_instance.k3s.id
  allocation_id = aws_eip.k3s.id
}

# ---------- Optional: Amazon RDS PostgreSQL ----------
resource "random_password" "db" {
  count   = var.create_rds ? 1 : 0
  length  = 24
  special = false
}

resource "aws_security_group" "rds" {
  count       = var.create_rds ? 1 : 0
  name        = "${var.project}-rds"
  description = "Postgres from the k3s node only"
  vpc_id      = data.aws_vpc.default.id
  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.k3s.id]
  }
}

resource "aws_db_subnet_group" "db" {
  count      = var.create_rds ? 1 : 0
  name       = "${var.project}-db"
  subnet_ids = data.aws_subnets.default.ids
}

resource "aws_db_parameter_group" "db" {
  count  = var.create_rds ? 1 : 0
  name   = "${var.project}-pg16"
  family = "postgres16"
  parameter {
    name         = "max_connections"
    value        = var.rds_max_connections
    apply_method = "pending-reboot"
  }
  # PgBouncer connects without TLS inside the VPC; keep the demo simple
  parameter {
    name  = "rds.force_ssl"
    value = "0"
  }
}

resource "aws_db_instance" "db" {
  count                  = var.create_rds ? 1 : 0
  identifier             = "${var.project}-db"
  engine                 = "postgres"
  engine_version         = "16"
  instance_class         = "db.t3.micro"
  allocated_storage      = 20
  db_name                = "chat"
  username               = "chat"
  password               = random_password.db[0].result
  db_subnet_group_name   = aws_db_subnet_group.db[0].name
  parameter_group_name   = aws_db_parameter_group.db[0].name
  vpc_security_group_ids = [aws_security_group.rds[0].id]
  publicly_accessible    = false
  skip_final_snapshot    = true
  apply_immediately      = true
}
