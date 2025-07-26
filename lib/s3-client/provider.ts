import { Construct } from "constructs";
import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as iam from "aws-cdk-lib/aws-iam";
import * as cr from "aws-cdk-lib/custom-resources";
import path from "path";
import { fileURLToPath } from "url";
import { s3CustomResourcePropertiesSchema } from "./schema.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROVIDER_ID = "CustomS3BucketProvider";

export class CustomS3BucketProvider extends Construct {
  private readonly provider: cr.Provider;

  /**
   * Returns the singleton provider.
   */
  public static getOrCreate(
    scope: Construct,
    props: { [key: string]: unknown }
  ) {
    const stack = cdk.Stack.of(scope);
    const id = `com.amazonaws.cdk.custom-resources.${PROVIDER_ID}`;
    // NOTE: Normally we would validate the properties in the lambda function with zod
    // but that would force us to introduce bundling and transpilation
    // so we validate them here instead.
    s3CustomResourcePropertiesSchema.parse(props);
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
        environment: {
          NODE_OPTIONS:
            "--experimental-strip-types --experimental-transform-types",
        },
        timeout: cdk.Duration.minutes(5),
        initialPolicy: [
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ["s3:*"],
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
