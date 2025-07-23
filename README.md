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

The WireGuard admin credentials can be provided at deployment time using CDK context variables.

**Option 1: Using CDK Context (Recommended)**

```bash
pnpx cdk deploy -c wireguard-username=myadmin -c wireguard-password=MySecurePassword123
```

**Option 2: Using cdk.json**
Add to your `cdk.json`:

```json
{
  "context": {
    "wireguard-username": "myadmin",
    "wireguard-password": "MySecurePassword123"
  }
}
```

## Deployment

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Set up your environment variables (create `.env` file or export them)

3. Deploy the stack:

   **With custom credentials:**

   ```bash
   pnpx cdk deploy -c wireguard-username=myadmin -c wireguard-password=MySecurePassword123
   ```

   **With default credentials:**

   ```bash
   pnpx cdk deploy
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
