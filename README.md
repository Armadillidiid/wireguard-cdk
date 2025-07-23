# WireGuard CDK Stack

This CDK project deploys a WireGuard VPN server on AWS EC2 with automatic SSL certificates and unattended setup.

## Environment Variables

Create a `.env` file or set the following environment variables:

```bash
# AWS Configuration
CDK_DEFAULT_ACCOUNT=your-aws-account-id
CDK_DEFAULT_REGION=us-east-1

# EC2 Instance Configuration
EC2_INSTANCE_CLASS=t3
EC2_INSTANCE_SIZE=micro
SSH_PUB_KEY="ssh-rsa AAAAB3NzaC1yc2E... your-public-key"

# SSL Certificate Configuration
DOMAIN=vpn.example.com
EMAIL=admin@example.com
```

## WireGuard Admin Configuration

The WireGuard admin credentials are provided as CloudFormation parameters at deployment time. If not provided, defaults will be used (`admin` / `admin123`).

**Option 1: Using CDK Deploy Parameters (Recommended)**
```bash
pnpx cdk deploy --parameters WireguardUsername=myadmin --parameters WireguardPassword=MySecurePassword123
```

**Option 2: Using CloudFormation Console**
When deploying through the AWS CloudFormation console, you'll be prompted to enter the parameter values.

## Deployment

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Set up your environment variables (create `.env` file or export them)

3. Deploy the stack:

   ```bash
   pnpx cdk deploy --parameters WireguardUsername=myadmin --parameters WireguardPassword=MySecurePassword123
   ```

4. After deployment, access your WireGuard admin panel at:

   ```
   https://your-domain.com
   ```

## Useful commands

- `pnpm run build` compile typescript to js
- `pnpm run watch` watch for changes and compile
- `pnpm run test` perform the jest unit tests
- `pnpx cdk deploy` deploy this stack to your default AWS account/region
- `pnpx cdk diff` compare deployed stack with current state
- `pnpx cdk synth` emits the synthesized CloudFormation template
