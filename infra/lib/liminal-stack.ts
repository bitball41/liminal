import * as cdk from 'aws-cdk-lib';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins  from 'aws-cdk-lib/aws-cloudfront-origins';
import { Construct } from 'constructs';

export class LiminalStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const originDomain = this.node.tryGetContext('originDomain') as string | undefined;
    if (!originDomain) {
      throw new Error(
        'Context value "originDomain" is required.\n' +
        'Run: cdk deploy -c originDomain=<your-eb-env>.elasticbeanstalk.com'
      );
    }

    const origin = new origins.HttpOrigin(originDomain, {
      protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
      httpPort: 80,
      keepaliveTimeout: cdk.Duration.seconds(60),
      readTimeout: cdk.Duration.seconds(60),
    });

    const noCache = new cloudfront.CachePolicy(this, 'NoCachePolicy', {
      cachePolicyName: 'LiminalNoCache',
      comment: 'No caching - for dynamic routes and WebSocket pass-through',
      defaultTtl: cdk.Duration.seconds(0),
      minTtl:     cdk.Duration.seconds(0),
      maxTtl:     cdk.Duration.seconds(0),
    });

    const staticCache = new cloudfront.CachePolicy(this, 'StaticCachePolicy', {
      cachePolicyName: 'LiminalStaticAssets',
      comment: 'Long-lived cache for versioned proxy library assets',
      defaultTtl: cdk.Duration.days(7),
      minTtl:     cdk.Duration.seconds(0),
      maxTtl:     cdk.Duration.days(365),
      enableAcceptEncodingGzip:   true,
      enableAcceptEncodingBrotli: true,
    });

    const staticBehavior = (p: origins.HttpOrigin): cloudfront.BehaviorOptions => ({
      origin: p,
      viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
      cachePolicy: staticCache,
      originRequestPolicy: cloudfront.OriginRequestPolicy.CORS_S3_ORIGIN,
    });

    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      comment: 'Liminal / Axis web proxy',
      defaultBehavior: {
        origin,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods:       cloudfront.AllowedMethods.ALLOW_ALL,
        cachePolicy:          noCache,
        originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
      },
      additionalBehaviors: {
        '/scramjet/*': staticBehavior(origin),
        '/baremux/*':  staticBehavior(origin),
        '/epoxy/*':    staticBehavior(origin),
        '/libcurl/*':  staticBehavior(origin),
      },
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
    });

    new cdk.CfnOutput(this, 'DistributionUrl', {
      value: `https://${distribution.distributionDomainName}`,
      description: 'CloudFront distribution URL',
    });

    new cdk.CfnOutput(this, 'DistributionId', {
      value: distribution.distributionId,
      description: 'CloudFront distribution ID - needed for cache invalidation',
    });
  }
}
