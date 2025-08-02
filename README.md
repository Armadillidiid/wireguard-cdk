# WireGuard CDK

This project deploys [WireGuard](https://www.wireguard.com/) VPN using [wg-easy](https://github.com/wg-easy/wg-easy) on AWS EC2 with automatic backups to S3.

## Prerequisites

- AWS Account
- AWS CLI configured with appropriate permissions

## Environment Variables

Create a `.env` file or set the following environment variables:

```bash
# EC2 Instance Configuration
EC2_INSTANCE_CLASS=t3
EC2_INSTANCE_SIZE=micro
SSH_PUB_KEY="ssh-rsa AAAAB3NzaC1yc2E... your-public-key"

# SSL Certificate Configuration
DOMAIN=vpn.example.com
EMAIL=admin@example.com
```

The WireGuard admin credentials are provided as [CloudFormation parameters](https://docs.aws.amazon.com/cdk/v2/guide/parameters.html) at deployment time, instead of at synthesis time. This is to avoid exposure in CFN template or stack logs.

Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, one number, and one special character. Otherwise, you won't be able to log in.

It's also good to note that no key pair is generated. You must provide your machine's SSH public key for SSH access. This is catted to `.ssh/authorized_keys` in the instance.

## Deployment

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Set up your environment variables (create `.env` file or export them)

3. Deploy the stack.

   ```bash
   pnpm exec cdk deploy --parameters WireguardUsername='admin' --parameters WireguardPassword='MySecurePassword123$'
   ```

4. (Optional): After deployment, point your domain's DNS to the public IP of the EC2 instance. You should be able to find the public IP outputted in the logs.

5. Access your WireGuard admin panel at your public IP.

   ```
   https://192.xxx.xx.xx
   ```

   Or if you configured a domain:

   ```
   https://your-domain.com
   ```
