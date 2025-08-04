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

4. After deployment, you'll get the public IP address in the CloudFormation outputs. You can use this to create an A record in your DNS provider.

5. Access your WireGuard admin panel at your public IP.

   ```
   https://192.xxx.xx.xx
   ```

   Or if you configured a domain:

   ```
   https://your-domain.com
   ```

## Important Note

There's a chicken-and-egg problem with SSL certificate provisioning on first deployment. When you first deploy, Caddy will attempt to get an SSL certificate via ACME challenge. Since the DNS record doesn't exist yet to reach the server, this will fail and Caddy will be temporarily throttled to avoid hitting rate limits.

To resolve this, use the IP address to access the dashboard initially. Caddy will automatically retry the certificate request periodically (max one day ceiling). Once Caddy retries, you should be able to access the admin panel via your domain name.

For the VPN itself, it works immediately, and you can use your domain name as the WireGuard hostname even before SSL is working. WireGuard uses its own encryption and doesn't rely on TLS/SSL certificates.

If you want the domain working instantly, you can SSH into the instance and restart Caddy server: `docker-compose -f wireguard/docker-compose.proxy.yml restart caddy`

## Troubleshooting

### SSL Certificate Issues

Like explained previously, this is expected behavior on first deployment. Use `https://your-public-ip` to access the admin panel in the meantime, until Caddy can retry acme challenges and successfully obtain the SSL certificate.

### Can't connect to VPN using domain name

WireGuard protocol doesn't require SSL/TLS so ensure your hostname is set correctly in the WireGuard client configuration and matches the domain you set up

### Can't SSH into the instance

Enbsure your SSH public key is correctly set in the `SSH_PUB_KEY` environment variable
