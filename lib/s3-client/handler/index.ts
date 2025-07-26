/// <reference path="../../../types/custom-resource.d.ts" />

import {
  S3Client,
  CreateBucketCommand,
  PutBucketVersioningCommand,
  PutBucketEncryptionCommand,
  PutPublicAccessBlockCommand,
  HeadBucketCommand,
  DeleteBucketCommand,
  ListObjectsV2Command,
  ServerSideEncryption,
  BucketAlreadyOwnedByYou,
  type PutBucketEncryptionCommandInput,
  NotFound,
  NoSuchBucket,
  S3ServiceException,
} from "@aws-sdk/client-s3";

const s3Client = new S3Client();

type S3CustomResourceProperties = {
  BucketName: string;
  Versioning?: boolean | undefined;
  PublicReadAccess?: boolean | undefined;
  Encryption?: "AES256" | "aws:kms" | undefined;
  KmsKeyId?: string | undefined;
};

export const S3_CUSTOM_RESOURCE_RESPONSE_ATTR = {
  BUCKET_NAME: "BucketName",
} as const;

export const handler = async (
  event: AWSCDKAsyncCustomResource.OnEventRequest,
): Promise<AWSCDKAsyncCustomResource.OnEventResponse> => {
  console.log("Event:", JSON.stringify(event, null, 2));

  const { RequestType } = event;

  try {
    switch (RequestType) {
      case "Create":
        return await handleCreate(event);
      case "Update":
        return await handleUpdate(event);
      case "Delete":
        return await handleDelete(event);
      default:
        throw new Error(`Unknown request type: ${RequestType}`);
    }
  } catch (error) {
    console.error("Error:", error);
    throw error;
  }
};

async function handleCreate(
  event: AWSCDKAsyncCustomResource.OnEventRequest,
): Promise<AWSCDKAsyncCustomResource.OnEventResponse> {
  const resourceProperties =
    event.ResourceProperties as S3CustomResourceProperties;

  const {
    BucketName: bucketName,
    Versioning: versioning,
    PublicReadAccess: publicReadAccess,
    Encryption: encryption,
    KmsKeyId: kmsKeyId,
  } = resourceProperties;

  console.log(`Creating bucket: ${bucketName}`);

  // Check if bucket already exists first
  try {
    await s3Client.send(new HeadBucketCommand({ Bucket: bucketName }));
    console.log(
      `Bucket ${bucketName} already exists - skipping creation and configuration`,
    );

    // Early return if bucket exists
    return {
      PhysicalResourceId: bucketName,
      Data: {
        [S3_CUSTOM_RESOURCE_RESPONSE_ATTR.BUCKET_NAME]: bucketName,
      },
    };
  } catch (error) {
    if (error instanceof NotFound || error instanceof NoSuchBucket) {
      console.log(`Bucket ${bucketName} does not exist, will create it`);
    } else {
      if (error instanceof S3ServiceException) {
        if (error.$metadata?.httpStatusCode === 301) {
          console.error(
            `Bucket ${bucketName} exists in a different region, skipping creation`,
          );
        }
        console.error(`Error checking bucket existence: ${error.message}`);
      }
      throw error;
    }
  }

  // Create bucket
  try {
    await s3Client.send(
      new CreateBucketCommand({
        Bucket: bucketName,
      }),
    );
    console.log(`Bucket ${bucketName} created successfully`);
  } catch (error) {
    if (error instanceof BucketAlreadyOwnedByYou) {
      console.log(`Bucket ${bucketName} already exists and is owned by you`);
    } else {
      throw error;
    }
  }

  // Configure versioning if specified
  if (versioning) {
    await s3Client.send(
      new PutBucketVersioningCommand({
        Bucket: bucketName,
        VersioningConfiguration: {
          Status: "Enabled",
        },
      }),
    );
    console.log("Versioning enabled");
  }

  // Configure public access block (inverse of publicReadAccess)
  await s3Client.send(
    new PutPublicAccessBlockCommand({
      Bucket: bucketName,
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: !publicReadAccess,
        IgnorePublicAcls: !publicReadAccess,
        BlockPublicPolicy: !publicReadAccess,
        RestrictPublicBuckets: !publicReadAccess,
      },
    }),
  );

  // Configure encryption if specified
  if (encryption) {
    const encryptionConfig: PutBucketEncryptionCommandInput = {
      Bucket: bucketName,
      ServerSideEncryptionConfiguration: {
        Rules: [
          {
            ApplyServerSideEncryptionByDefault: {
              SSEAlgorithm:
                encryption === "aws:kms"
                  ? ServerSideEncryption.aws_kms
                  : ServerSideEncryption.AES256,
            },
          },
        ],
      },
    };

    if (encryption === "aws:kms" && kmsKeyId) {
      const rule =
        encryptionConfig.ServerSideEncryptionConfiguration?.Rules?.[0];
      if (rule?.ApplyServerSideEncryptionByDefault) {
        rule.ApplyServerSideEncryptionByDefault.KMSMasterKeyID = kmsKeyId;
      }
    }

    await s3Client.send(new PutBucketEncryptionCommand(encryptionConfig));
    console.log(`Encryption configured: ${encryption}`);
  }

  return {
    PhysicalResourceId: bucketName,
    Data: {
      [S3_CUSTOM_RESOURCE_RESPONSE_ATTR.BUCKET_NAME]: bucketName,
    },
  };
}

async function handleUpdate(
  event: AWSCDKAsyncCustomResource.OnEventRequest,
): Promise<AWSCDKAsyncCustomResource.OnEventResponse> {
  const resourceProperties =
    event.ResourceProperties as S3CustomResourceProperties;
  const {
    BucketName: bucketName,
    Versioning: _versioning,
    PublicReadAccess: publicReadAccess,
    Encryption: encryption,
    KmsKeyId: kmsKeyId,
  } = resourceProperties;

  console.log(`Update requested for bucket: ${bucketName}`);

  const oldProps = event.OldResourceProperties;
  const newProps = event.ResourceProperties;

  // Check if bucket name changed - this would require recreation, so do nothing
  if (oldProps?.BucketName !== newProps.BucketName) {
    console.log(
      "Bucket name change detected - skipping update to avoid recreation",
    );
    return {
      PhysicalResourceId: oldProps?.BucketName, // Keep old physical ID
      Data: {
        [S3_CUSTOM_RESOURCE_RESPONSE_ATTR.BUCKET_NAME]: oldProps?.BucketName,
      },
    };
  }

  // Check if bucket exists
  try {
    await s3Client.send(new HeadBucketCommand({ Bucket: bucketName }));
  } catch (error) {
    console.error("Bucket does not exist - skipping update");
    throw error;
  }

  // Update versioning if changed and safe to do so
  if (oldProps?.Versioning !== newProps.Versioning) {
    if (newProps.Versioning) {
      // Enabling versioning is safe
      await s3Client.send(
        new PutBucketVersioningCommand({
          Bucket: bucketName,
          VersioningConfiguration: {
            Status: "Enabled",
          },
        }),
      );
      console.log("Versioning enabled");
    } else {
      console.log(
        "Versioning disable requested - skipping as it's not possible",
      );
    }
  }

  // Update public access settings if changed
  if (oldProps?.PublicReadAccess !== newProps.PublicReadAccess) {
    await s3Client.send(
      new PutPublicAccessBlockCommand({
        Bucket: bucketName,
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: !publicReadAccess,
          IgnorePublicAcls: !publicReadAccess,
          BlockPublicPolicy: !publicReadAccess,
          RestrictPublicBuckets: !publicReadAccess,
        },
      }),
    );
    console.log("Public access settings updated");
  }

  // Update encryption if changed and safe to do so
  if (
    oldProps?.Encryption !== newProps.Encryption ||
    oldProps?.KmsKeyId !== newProps.KmsKeyId
  ) {
    if (encryption) {
      const encryptionConfig: PutBucketEncryptionCommandInput = {
        Bucket: bucketName,
        ServerSideEncryptionConfiguration: {
          Rules: [
            {
              ApplyServerSideEncryptionByDefault: {
                SSEAlgorithm:
                  encryption === "aws:kms"
                    ? ServerSideEncryption.aws_kms
                    : ServerSideEncryption.AES256,
              },
            },
          ],
        },
      };

      if (encryption === "aws:kms" && kmsKeyId) {
        const rule =
          encryptionConfig.ServerSideEncryptionConfiguration?.Rules?.[0];
        if (rule?.ApplyServerSideEncryptionByDefault) {
          rule.ApplyServerSideEncryptionByDefault.KMSMasterKeyID = kmsKeyId;
        }
      }

      await s3Client.send(new PutBucketEncryptionCommand(encryptionConfig));
      console.log(`Encryption updated: ${encryption}`);
    }
  }

  return {
    PhysicalResourceId: bucketName,
    Data: {
      [S3_CUSTOM_RESOURCE_RESPONSE_ATTR.BUCKET_NAME]: bucketName,
    },
  };
}

async function handleDelete(
  event: AWSCDKAsyncCustomResource.OnEventRequest,
): Promise<AWSCDKAsyncCustomResource.OnEventResponse> {
  const resourceProperties =
    event.ResourceProperties as S3CustomResourceProperties;
  const { BucketName: bucketName } = resourceProperties;

  console.log(`Delete requested for bucket: ${bucketName}`);

  try {
    // Check if bucket exists
    await s3Client.send(new HeadBucketCommand({ Bucket: bucketName }));
    console.log(`Bucket ${bucketName} exists, checking if it's empty`);

    // Check if bucket is empty
    const listResult = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: bucketName,
        MaxKeys: 1, // Only need to check if any objects exist
      }),
    );

    if (listResult.Contents && listResult.Contents.length > 0) {
      console.log(
        `Bucket ${bucketName} contains objects, skipping deletion to prevent data loss`,
      );
      console.log(`Found ${listResult.KeyCount} objects in bucket`);
    } else {
      // Bucket is empty, safe to delete
      await s3Client.send(new DeleteBucketCommand({ Bucket: bucketName }));
      console.log(`Bucket ${bucketName} deleted successfully`);
    }
  } catch (error) {
    console.error("Error during bucket deletion");
    throw error;
  }

  return {
    PhysicalResourceId: bucketName,
    Data: {
      [S3_CUSTOM_RESOURCE_RESPONSE_ATTR.BUCKET_NAME]: bucketName,
    },
  };
}

export default handler;
