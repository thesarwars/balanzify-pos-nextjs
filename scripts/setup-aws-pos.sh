#!/bin/bash
# One-time AWS setup for Balanzify POS on EC2
# Creates S3 bucket, updates BalanzifyS3Role policy, attaches role to EC2
#
# Usage: ./scripts/setup-aws-pos.sh

set -euo pipefail

REGION="${AWS_REGION:-us-east-2}"
BUCKET="${S3_BUCKET:-balanzify-pos-s3}"
INSTANCE_ID="${EC2_INSTANCE_ID:-i-095c5a5e4515f33ef}"
ROLE_NAME="BalanzifyS3Role"
POLICY_ARN="arn:aws:iam::511590151275:policy/BalanzifyS3AccessPolicy"
OLD_BUCKET="balanzify-s3-511590151275-us-east-2-an"

echo "=== Creating S3 bucket: $BUCKET ==="
if aws s3api head-bucket --bucket "$BUCKET" --region "$REGION" 2>/dev/null; then
  echo "Bucket already exists."
else
  aws s3api create-bucket \
    --bucket "$BUCKET" \
    --region "$REGION" \
    --create-bucket-configuration LocationConstraint="$REGION"
fi

aws s3api put-bucket-versioning \
  --bucket "$BUCKET" \
  --versioning-configuration Status=Enabled

aws s3api put-bucket-encryption \
  --bucket "$BUCKET" \
  --server-side-encryption-configuration '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'

# Public read required — app stores direct S3 URLs for product images
aws s3api put-public-access-block \
  --bucket "$BUCKET" \
  --public-access-block-configuration BlockPublicAcls=false,IgnorePublicAcls=false,BlockPublicPolicy=false,RestrictPublicBuckets=false

aws s3api put-bucket-policy --bucket "$BUCKET" --policy "$(cat <<EOF
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "PublicReadProductImages",
    "Effect": "Allow",
    "Principal": "*",
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::${BUCKET}/*"
  }]
}
EOF
)"

aws s3api put-bucket-cors --bucket "$BUCKET" --cors-configuration "$(cat <<EOF
{
  "CORSRules": [{
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "PUT", "POST", "HEAD"],
    "AllowedOrigins": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }]
}
EOF
)"

echo "=== Updating IAM policy: $POLICY_ARN ==="
aws iam create-policy-version \
  --policy-arn "$POLICY_ARN" \
  --set-as-default \
  --policy-document "$(cat <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DjangoS3Access",
      "Effect": "Allow",
      "Action": ["s3:PutObject","s3:PutObjectAcl","s3:GetObject","s3:DeleteObject","s3:ListBucket"],
      "Resource": [
        "arn:aws:s3:::${OLD_BUCKET}",
        "arn:aws:s3:::${OLD_BUCKET}/*"
      ]
    },
    {
      "Sid": "PosS3Access",
      "Effect": "Allow",
      "Action": ["s3:PutObject","s3:PutObjectAcl","s3:GetObject","s3:DeleteObject","s3:ListBucket"],
      "Resource": [
        "arn:aws:s3:::${BUCKET}",
        "arn:aws:s3:::${BUCKET}/*"
      ]
    }
  ]
}
EOF
)"

echo "=== Attaching instance profile to EC2: $INSTANCE_ID ==="
EXISTING=$(aws ec2 describe-iam-instance-profile-associations \
  --filters Name=instance-id,Values="$INSTANCE_ID" \
  --region "$REGION" \
  --query 'IamInstanceProfileAssociations[0].AssociationId' \
  --output text 2>/dev/null || echo "None")

if [ "$EXISTING" != "None" ] && [ -n "$EXISTING" ]; then
  echo "Instance already has a profile attached: $EXISTING"
else
  aws ec2 associate-iam-instance-profile \
    --instance-id "$INSTANCE_ID" \
    --iam-instance-profile Name="$ROLE_NAME" \
    --region "$REGION"
fi

echo ""
echo "Done."
echo "  S3 bucket:  $BUCKET"
echo "  IAM role:   arn:aws:iam::511590151275:role/$ROLE_NAME"
echo "  EC2:        $INSTANCE_ID"
echo ""
echo "Next: set S3_BUCKET=$BUCKET in .env.ec2, then run ./scripts/deploy-ec2.sh"
