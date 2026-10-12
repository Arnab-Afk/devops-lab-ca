variable "region" {
  description = "AWS region (AWS Academy Learner Lab only allows us-east-1 / us-west-2)"
  type        = string
  default     = "us-east-1"
}

variable "project" {
  type    = string
  default = "devops-chat"
}

variable "instance_type" {
  description = "t3.xlarge (4 vCPU) leaves room for the HPA to scale to 10 backend pods"
  type        = string
  default     = "t3.xlarge"
}

variable "key_name" {
  description = "Existing EC2 key pair for SSH (Learner Lab: vockey)"
  type        = string
}

variable "admin_cidr" {
  description = "CIDR allowed to SSH and reach the Kubernetes API (6443). Use your IP/32; 0.0.0.0/0 is needed for GitHub-hosted runners"
  type        = string
  default     = "0.0.0.0/0"
}

variable "create_rds" {
  description = "Also create an Amazon RDS PostgreSQL instance (otherwise Postgres runs inside the cluster)"
  type        = bool
  default     = false
}

variable "rds_max_connections" {
  description = "Kept low on purpose so the connection bottleneck is visible"
  type        = number
  default     = 40
}
