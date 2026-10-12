#!/bin/bash
# Installs single-node k3s. Rendered by Terraform (public_ip is the Elastic IP).
set -euxo pipefail
curl -sfL https://get.k3s.io | INSTALL_K3S_VERSION="v1.33.4+k3s1" \
  INSTALL_K3S_EXEC="server --tls-san ${public_ip} --write-kubeconfig-mode 644" sh -
# Ready-to-copy kubeconfig that points at the public IP
until [ -f /etc/rancher/k3s/k3s.yaml ]; do sleep 2; done
sed "s/127.0.0.1/${public_ip}/" /etc/rancher/k3s/k3s.yaml > /home/ubuntu/kubeconfig
chown ubuntu:ubuntu /home/ubuntu/kubeconfig
