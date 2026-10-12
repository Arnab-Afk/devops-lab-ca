output "public_ip" {
  value = aws_eip.k3s.public_ip
}

output "app_url" {
  value = "http://${aws_eip.k3s.public_ip}"
}

output "ecr_registry" {
  value = split("/", aws_ecr_repository.app["chat-backend"].repository_url)[0]
}

output "ssh" {
  value = "ssh -i <your-key>.pem ubuntu@${aws_eip.k3s.public_ip}"
}

output "get_kubeconfig" {
  value = "scp -i <your-key>.pem ubuntu@${aws_eip.k3s.public_ip}:kubeconfig ./kubeconfig"
}

output "rds_endpoint" {
  value = var.create_rds ? aws_db_instance.db[0].address : null
}

output "rds_password" {
  value     = var.create_rds ? random_password.db[0].result : null
  sensitive = true
}
