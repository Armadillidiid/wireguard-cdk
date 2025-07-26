import { Construct } from "constructs";
import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as iam from "aws-cdk-lib/aws-iam";
import * as cr from "aws-cdk-lib/custom-resources";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROVIDER_ID = "CustomS3BucketProvider";

export class CustomS3BucketProvider extends Construct {
  private readonly provider: cr.Provider;

  /**
   * Returns the singleton provider.
   */
  public static getOrCreate(scope: Construct) {
    const stack = cdk.Stack.of(scope);
    const id = `com.amazonaws.cdk.custom-resources.${PROVIDER_ID}`;
    const x =
      (stack.node.tryFindChild(id) as CustomS3BucketProvider) ||
      new CustomS3BucketProvider(stack, id);
    return x.provider.serviceToken;
  }

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.provider = new cr.Provider(this, PROVIDER_ID, {
      onEventHandler: new lambda.Function(this, "S3CustomResourceHandler", {
        runtime: lambda.Runtime.NODEJS_22_X,
        handler: "index.handler",
        code: lambda.Code.fromAsset(path.join(__dirname, "handler")),
        timeout: cdk.Duration.minutes(5),
        initialPolicy: [
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
              "s3:CreateBucket",
              "s3:HeadBucket",
              "s3:GetBucketVersioning",
              "s3:PutBucketVersioning",
              "s3:GetBucketEncryption",
              "s3:PutBucketEncryption",
              "s3:GetPublicAccessBlock",
              "s3:PutPublicAccessBlock",
              "s3:GetBucketLocation",
            ],
            resources: ["*"],
          }),
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ["kms:Decrypt", "kms:GenerateDataKey"],
            resources: ["*"],
          }),
        ],
      }),
    });
  }
}
