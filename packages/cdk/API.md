# API Reference <a name="API Reference" id="api-reference"></a>

## Constructs <a name="Constructs" id="Constructs"></a>

### SesMailCatcher <a name="SesMailCatcher" id="@s-yoshiki/cdk-ses-mail-catcher.SesMailCatcher"></a>

A serverless SES-compatible mail catcher for development and test environments.

The construct creates an API Gateway endpoint that accepts SES v1
`SendEmail`/`SendRawEmail` requests and SES v2 `SendEmail` requests. It
stores canonical raw MIME in S3 and searchable metadata in DynamoDB. An
optional CloudFront-hosted viewer uses a separate read-only API.

#### Initializers <a name="Initializers" id="@s-yoshiki/cdk-ses-mail-catcher.SesMailCatcher.Initializer"></a>

```typescript
import { SesMailCatcher } from '@s-yoshiki/cdk-ses-mail-catcher'

new SesMailCatcher(scope: Construct, id: string, props?: SesMailCatcherProps)
```

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@s-yoshiki/cdk-ses-mail-catcher.SesMailCatcher.Initializer.parameter.scope">scope</a></code> | <code>constructs.Construct</code> | *No description.* |
| <code><a href="#@s-yoshiki/cdk-ses-mail-catcher.SesMailCatcher.Initializer.parameter.id">id</a></code> | <code>string</code> | *No description.* |
| <code><a href="#@s-yoshiki/cdk-ses-mail-catcher.SesMailCatcher.Initializer.parameter.props">props</a></code> | <code><a href="#@s-yoshiki/cdk-ses-mail-catcher.SesMailCatcherProps">SesMailCatcherProps</a></code> | *No description.* |

---

##### `scope`<sup>Required</sup> <a name="scope" id="@s-yoshiki/cdk-ses-mail-catcher.SesMailCatcher.Initializer.parameter.scope"></a>

- *Type:* constructs.Construct

---

##### `id`<sup>Required</sup> <a name="id" id="@s-yoshiki/cdk-ses-mail-catcher.SesMailCatcher.Initializer.parameter.id"></a>

- *Type:* string

---

##### `props`<sup>Optional</sup> <a name="props" id="@s-yoshiki/cdk-ses-mail-catcher.SesMailCatcher.Initializer.parameter.props"></a>

- *Type:* <a href="#@s-yoshiki/cdk-ses-mail-catcher.SesMailCatcherProps">SesMailCatcherProps</a>

---

#### Methods <a name="Methods" id="Methods"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@s-yoshiki/cdk-ses-mail-catcher.SesMailCatcher.toString">toString</a></code> | Returns a string representation of this construct. |
| <code><a href="#@s-yoshiki/cdk-ses-mail-catcher.SesMailCatcher.with">with</a></code> | Applies one or more mixins to this construct. |
| <code><a href="#@s-yoshiki/cdk-ses-mail-catcher.SesMailCatcher.grantMailApiInvoke">grantMailApiInvoke</a></code> | Grants an AWS principal permission to call the mail API when IAM authorization is enabled. |

---

##### `toString` <a name="toString" id="@s-yoshiki/cdk-ses-mail-catcher.SesMailCatcher.toString"></a>

```typescript
public toString(): string
```

Returns a string representation of this construct.

##### `with` <a name="with" id="@s-yoshiki/cdk-ses-mail-catcher.SesMailCatcher.with"></a>

```typescript
public with(mixins: ...IMixin[]): IConstruct
```

Applies one or more mixins to this construct.

Mixins are applied in order. The list of constructs is captured at the
start of the call, so constructs added by a mixin will not be visited.
Use multiple `with()` calls if subsequent mixins should apply to added
constructs.

###### `mixins`<sup>Required</sup> <a name="mixins" id="@s-yoshiki/cdk-ses-mail-catcher.SesMailCatcher.with.parameter.mixins"></a>

- *Type:* ...constructs.IMixin[]

The mixins to apply.

---

##### `grantMailApiInvoke` <a name="grantMailApiInvoke" id="@s-yoshiki/cdk-ses-mail-catcher.SesMailCatcher.grantMailApiInvoke"></a>

```typescript
public grantMailApiInvoke(grantee: IGrantable): void
```

Grants an AWS principal permission to call the mail API when IAM authorization is enabled.

###### `grantee`<sup>Required</sup> <a name="grantee" id="@s-yoshiki/cdk-ses-mail-catcher.SesMailCatcher.grantMailApiInvoke.parameter.grantee"></a>

- *Type:* aws-cdk-lib.aws_iam.IGrantable

the Lambda, role, or other IAM principal that sends mail.

---

#### Static Functions <a name="Static Functions" id="Static Functions"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@s-yoshiki/cdk-ses-mail-catcher.SesMailCatcher.isConstruct">isConstruct</a></code> | Checks if `x` is a construct. |

---

##### `isConstruct` <a name="isConstruct" id="@s-yoshiki/cdk-ses-mail-catcher.SesMailCatcher.isConstruct"></a>

```typescript
import { SesMailCatcher } from '@s-yoshiki/cdk-ses-mail-catcher'

SesMailCatcher.isConstruct(x: any)
```

Checks if `x` is a construct.

Use this method instead of `instanceof` to properly detect `Construct`
instances, even when the construct library is symlinked.

Explanation: in JavaScript, multiple copies of the `constructs` library on
disk are seen as independent, completely different libraries. As a
consequence, the class `Construct` in each copy of the `constructs` library
is seen as a different class, and an instance of one class will not test as
`instanceof` the other class. `npm install` will not create installations
like this, but users may manually symlink construct libraries together or
use a monorepo tool: in those cases, multiple copies of the `constructs`
library can be accidentally installed, and `instanceof` will behave
unpredictably. It is safest to avoid using `instanceof`, and using
this type-testing method instead.

###### `x`<sup>Required</sup> <a name="x" id="@s-yoshiki/cdk-ses-mail-catcher.SesMailCatcher.isConstruct.parameter.x"></a>

- *Type:* any

Any object.

---

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@s-yoshiki/cdk-ses-mail-catcher.SesMailCatcher.property.node">node</a></code> | <code>constructs.Node</code> | The tree node. |
| <code><a href="#@s-yoshiki/cdk-ses-mail-catcher.SesMailCatcher.property.bucket">bucket</a></code> | <code>aws-cdk-lib.aws_s3.IBucket</code> | The raw-message storage bucket. |
| <code><a href="#@s-yoshiki/cdk-ses-mail-catcher.SesMailCatcher.property.mailApi">mailApi</a></code> | <code>aws-cdk-lib.aws_apigateway.RestApi</code> | The SES-compatible mail API. |
| <code><a href="#@s-yoshiki/cdk-ses-mail-catcher.SesMailCatcher.property.mailApiEndpoint">mailApiEndpoint</a></code> | <code>string</code> | The endpoint to use as an AWS SDK SES client endpoint. |
| <code><a href="#@s-yoshiki/cdk-ses-mail-catcher.SesMailCatcher.property.mailFunction">mailFunction</a></code> | <code>aws-cdk-lib.aws_lambda.Function</code> | The Lambda function behind the SES-compatible mail API. |
| <code><a href="#@s-yoshiki/cdk-ses-mail-catcher.SesMailCatcher.property.table">table</a></code> | <code>aws-cdk-lib.aws_dynamodb.ITable</code> | The message metadata table. |
| <code><a href="#@s-yoshiki/cdk-ses-mail-catcher.SesMailCatcher.property.viewerApi">viewerApi</a></code> | <code>aws-cdk-lib.aws_apigateway.RestApi</code> | The read-only viewer API, when a viewer is configured. |
| <code><a href="#@s-yoshiki/cdk-ses-mail-catcher.SesMailCatcher.property.viewerDistribution">viewerDistribution</a></code> | <code>aws-cdk-lib.aws_cloudfront.IDistribution</code> | The CloudFront distribution serving the viewer, when configured. |
| <code><a href="#@s-yoshiki/cdk-ses-mail-catcher.SesMailCatcher.property.viewerFunction">viewerFunction</a></code> | <code>aws-cdk-lib.aws_lambda.Function</code> | The Lambda function behind the viewer API, when configured. |
| <code><a href="#@s-yoshiki/cdk-ses-mail-catcher.SesMailCatcher.property.viewerUrl">viewerUrl</a></code> | <code>string</code> | The CloudFront URL serving the viewer, when configured. |
| <code><a href="#@s-yoshiki/cdk-ses-mail-catcher.SesMailCatcher.property.webBucket">webBucket</a></code> | <code>aws-cdk-lib.aws_s3.IBucket</code> | The S3 bucket containing the viewer web application, when configured. |

---

##### `node`<sup>Required</sup> <a name="node" id="@s-yoshiki/cdk-ses-mail-catcher.SesMailCatcher.property.node"></a>

```typescript
public readonly node: Node;
```

- *Type:* constructs.Node

The tree node.

---

##### `bucket`<sup>Required</sup> <a name="bucket" id="@s-yoshiki/cdk-ses-mail-catcher.SesMailCatcher.property.bucket"></a>

```typescript
public readonly bucket: IBucket;
```

- *Type:* aws-cdk-lib.aws_s3.IBucket

The raw-message storage bucket.

---

##### `mailApi`<sup>Required</sup> <a name="mailApi" id="@s-yoshiki/cdk-ses-mail-catcher.SesMailCatcher.property.mailApi"></a>

```typescript
public readonly mailApi: RestApi;
```

- *Type:* aws-cdk-lib.aws_apigateway.RestApi

The SES-compatible mail API.

---

##### `mailApiEndpoint`<sup>Required</sup> <a name="mailApiEndpoint" id="@s-yoshiki/cdk-ses-mail-catcher.SesMailCatcher.property.mailApiEndpoint"></a>

```typescript
public readonly mailApiEndpoint: string;
```

- *Type:* string

The endpoint to use as an AWS SDK SES client endpoint.

---

##### `mailFunction`<sup>Required</sup> <a name="mailFunction" id="@s-yoshiki/cdk-ses-mail-catcher.SesMailCatcher.property.mailFunction"></a>

```typescript
public readonly mailFunction: Function;
```

- *Type:* aws-cdk-lib.aws_lambda.Function

The Lambda function behind the SES-compatible mail API.

---

##### `table`<sup>Required</sup> <a name="table" id="@s-yoshiki/cdk-ses-mail-catcher.SesMailCatcher.property.table"></a>

```typescript
public readonly table: ITable;
```

- *Type:* aws-cdk-lib.aws_dynamodb.ITable

The message metadata table.

---

##### `viewerApi`<sup>Optional</sup> <a name="viewerApi" id="@s-yoshiki/cdk-ses-mail-catcher.SesMailCatcher.property.viewerApi"></a>

```typescript
public readonly viewerApi: RestApi;
```

- *Type:* aws-cdk-lib.aws_apigateway.RestApi

The read-only viewer API, when a viewer is configured.

---

##### `viewerDistribution`<sup>Optional</sup> <a name="viewerDistribution" id="@s-yoshiki/cdk-ses-mail-catcher.SesMailCatcher.property.viewerDistribution"></a>

```typescript
public readonly viewerDistribution: IDistribution;
```

- *Type:* aws-cdk-lib.aws_cloudfront.IDistribution

The CloudFront distribution serving the viewer, when configured.

---

##### `viewerFunction`<sup>Optional</sup> <a name="viewerFunction" id="@s-yoshiki/cdk-ses-mail-catcher.SesMailCatcher.property.viewerFunction"></a>

```typescript
public readonly viewerFunction: Function;
```

- *Type:* aws-cdk-lib.aws_lambda.Function

The Lambda function behind the viewer API, when configured.

---

##### `viewerUrl`<sup>Optional</sup> <a name="viewerUrl" id="@s-yoshiki/cdk-ses-mail-catcher.SesMailCatcher.property.viewerUrl"></a>

```typescript
public readonly viewerUrl: string;
```

- *Type:* string

The CloudFront URL serving the viewer, when configured.

---

##### `webBucket`<sup>Optional</sup> <a name="webBucket" id="@s-yoshiki/cdk-ses-mail-catcher.SesMailCatcher.property.webBucket"></a>

```typescript
public readonly webBucket: IBucket;
```

- *Type:* aws-cdk-lib.aws_s3.IBucket

The S3 bucket containing the viewer web application, when configured.

---


## Structs <a name="Structs" id="Structs"></a>

### MailApiOptions <a name="MailApiOptions" id="@s-yoshiki/cdk-ses-mail-catcher.MailApiOptions"></a>

Settings for the SES-compatible mail API.

#### Initializer <a name="Initializer" id="@s-yoshiki/cdk-ses-mail-catcher.MailApiOptions.Initializer"></a>

```typescript
import { MailApiOptions } from '@s-yoshiki/cdk-ses-mail-catcher'

const mailApiOptions: MailApiOptions = { ... }
```

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@s-yoshiki/cdk-ses-mail-catcher.MailApiOptions.property.allowedIpCidrs">allowedIpCidrs</a></code> | <code>string[]</code> | IPv4 and IPv6 CIDR ranges allowed to call the mail API. |
| <code><a href="#@s-yoshiki/cdk-ses-mail-catcher.MailApiOptions.property.authorization">authorization</a></code> | <code><a href="#@s-yoshiki/cdk-ses-mail-catcher.ApiAuthorization">ApiAuthorization</a></code> | How callers are authorized. |
| <code><a href="#@s-yoshiki/cdk-ses-mail-catcher.MailApiOptions.property.timeout">timeout</a></code> | <code>aws-cdk-lib.Duration</code> | Lambda timeout. |

---

##### `allowedIpCidrs`<sup>Optional</sup> <a name="allowedIpCidrs" id="@s-yoshiki/cdk-ses-mail-catcher.MailApiOptions.property.allowedIpCidrs"></a>

```typescript
public readonly allowedIpCidrs: string[];
```

- *Type:* string[]

IPv4 and IPv6 CIDR ranges allowed to call the mail API.

---

##### `authorization`<sup>Optional</sup> <a name="authorization" id="@s-yoshiki/cdk-ses-mail-catcher.MailApiOptions.property.authorization"></a>

```typescript
public readonly authorization: ApiAuthorization;
```

- *Type:* <a href="#@s-yoshiki/cdk-ses-mail-catcher.ApiAuthorization">ApiAuthorization</a>
- *Default:* ApiAuthorization.NONE

How callers are authorized.

---

##### `timeout`<sup>Optional</sup> <a name="timeout" id="@s-yoshiki/cdk-ses-mail-catcher.MailApiOptions.property.timeout"></a>

```typescript
public readonly timeout: Duration;
```

- *Type:* aws-cdk-lib.Duration
- *Default:* Duration.seconds(29)

Lambda timeout.

---

### MailStorage <a name="MailStorage" id="@s-yoshiki/cdk-ses-mail-catcher.MailStorage"></a>

Existing resources that can be used instead of creating new storage.

#### Initializer <a name="Initializer" id="@s-yoshiki/cdk-ses-mail-catcher.MailStorage.Initializer"></a>

```typescript
import { MailStorage } from '@s-yoshiki/cdk-ses-mail-catcher'

const mailStorage: MailStorage = { ... }
```

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@s-yoshiki/cdk-ses-mail-catcher.MailStorage.property.bucket">bucket</a></code> | <code>aws-cdk-lib.aws_s3.IBucket</code> | An existing bucket for raw MIME messages. |
| <code><a href="#@s-yoshiki/cdk-ses-mail-catcher.MailStorage.property.table">table</a></code> | <code>aws-cdk-lib.aws_dynamodb.ITable</code> | An existing table for message metadata. |

---

##### `bucket`<sup>Optional</sup> <a name="bucket" id="@s-yoshiki/cdk-ses-mail-catcher.MailStorage.property.bucket"></a>

```typescript
public readonly bucket: IBucket;
```

- *Type:* aws-cdk-lib.aws_s3.IBucket

An existing bucket for raw MIME messages.

---

##### `table`<sup>Optional</sup> <a name="table" id="@s-yoshiki/cdk-ses-mail-catcher.MailStorage.property.table"></a>

```typescript
public readonly table: ITable;
```

- *Type:* aws-cdk-lib.aws_dynamodb.ITable

An existing table for message metadata.

---

### SesMailCatcherProps <a name="SesMailCatcherProps" id="@s-yoshiki/cdk-ses-mail-catcher.SesMailCatcherProps"></a>

Properties for {@link SesMailCatcher}.

#### Initializer <a name="Initializer" id="@s-yoshiki/cdk-ses-mail-catcher.SesMailCatcherProps.Initializer"></a>

```typescript
import { SesMailCatcherProps } from '@s-yoshiki/cdk-ses-mail-catcher'

const sesMailCatcherProps: SesMailCatcherProps = { ... }
```

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@s-yoshiki/cdk-ses-mail-catcher.SesMailCatcherProps.property.mailApi">mailApi</a></code> | <code><a href="#@s-yoshiki/cdk-ses-mail-catcher.MailApiOptions">MailApiOptions</a></code> | Settings for the SES-compatible mail API. |
| <code><a href="#@s-yoshiki/cdk-ses-mail-catcher.SesMailCatcherProps.property.retention">retention</a></code> | <code>aws-cdk-lib.Duration</code> | How long captured messages remain available. |
| <code><a href="#@s-yoshiki/cdk-ses-mail-catcher.SesMailCatcherProps.property.storage">storage</a></code> | <code><a href="#@s-yoshiki/cdk-ses-mail-catcher.MailStorage">MailStorage</a></code> | Existing or custom storage resources. |
| <code><a href="#@s-yoshiki/cdk-ses-mail-catcher.SesMailCatcherProps.property.viewer">viewer</a></code> | <code><a href="#@s-yoshiki/cdk-ses-mail-catcher.ViewerOptions">ViewerOptions</a></code> | If supplied, creates the viewer web application and API. |

---

##### `mailApi`<sup>Optional</sup> <a name="mailApi" id="@s-yoshiki/cdk-ses-mail-catcher.SesMailCatcherProps.property.mailApi"></a>

```typescript
public readonly mailApi: MailApiOptions;
```

- *Type:* <a href="#@s-yoshiki/cdk-ses-mail-catcher.MailApiOptions">MailApiOptions</a>

Settings for the SES-compatible mail API.

---

##### `retention`<sup>Optional</sup> <a name="retention" id="@s-yoshiki/cdk-ses-mail-catcher.SesMailCatcherProps.property.retention"></a>

```typescript
public readonly retention: Duration;
```

- *Type:* aws-cdk-lib.Duration
- *Default:* Duration.days(7)

How long captured messages remain available.

---

##### `storage`<sup>Optional</sup> <a name="storage" id="@s-yoshiki/cdk-ses-mail-catcher.SesMailCatcherProps.property.storage"></a>

```typescript
public readonly storage: MailStorage;
```

- *Type:* <a href="#@s-yoshiki/cdk-ses-mail-catcher.MailStorage">MailStorage</a>

Existing or custom storage resources.

---

##### `viewer`<sup>Optional</sup> <a name="viewer" id="@s-yoshiki/cdk-ses-mail-catcher.SesMailCatcherProps.property.viewer"></a>

```typescript
public readonly viewer: ViewerOptions;
```

- *Type:* <a href="#@s-yoshiki/cdk-ses-mail-catcher.ViewerOptions">ViewerOptions</a>

If supplied, creates the viewer web application and API.

---

### ViewerOptions <a name="ViewerOptions" id="@s-yoshiki/cdk-ses-mail-catcher.ViewerOptions"></a>

Settings for the CloudFront-hosted viewer.

#### Initializer <a name="Initializer" id="@s-yoshiki/cdk-ses-mail-catcher.ViewerOptions.Initializer"></a>

```typescript
import { ViewerOptions } from '@s-yoshiki/cdk-ses-mail-catcher'

const viewerOptions: ViewerOptions = { ... }
```

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@s-yoshiki/cdk-ses-mail-catcher.ViewerOptions.property.allowedIpCidrs">allowedIpCidrs</a></code> | <code>string[]</code> | IPv4 and IPv6 CIDR ranges allowed at the CloudFront edge. |
| <code><a href="#@s-yoshiki/cdk-ses-mail-catcher.ViewerOptions.property.timeout">timeout</a></code> | <code>aws-cdk-lib.Duration</code> | Lambda timeout for viewer API requests. |

---

##### `allowedIpCidrs`<sup>Required</sup> <a name="allowedIpCidrs" id="@s-yoshiki/cdk-ses-mail-catcher.ViewerOptions.property.allowedIpCidrs"></a>

```typescript
public readonly allowedIpCidrs: string[];
```

- *Type:* string[]

IPv4 and IPv6 CIDR ranges allowed at the CloudFront edge.

This is required when the viewer is enabled. The same restriction applies
to the viewer web application and its `/api/*` behavior.

---

##### `timeout`<sup>Optional</sup> <a name="timeout" id="@s-yoshiki/cdk-ses-mail-catcher.ViewerOptions.property.timeout"></a>

```typescript
public readonly timeout: Duration;
```

- *Type:* aws-cdk-lib.Duration
- *Default:* Duration.seconds(29)

Lambda timeout for viewer API requests.

---



## Enums <a name="Enums" id="Enums"></a>

### ApiAuthorization <a name="ApiAuthorization" id="@s-yoshiki/cdk-ses-mail-catcher.ApiAuthorization"></a>

Authorization used by an API Gateway API.

#### Members <a name="Members" id="Members"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@s-yoshiki/cdk-ses-mail-catcher.ApiAuthorization.NONE">NONE</a></code> | The API is callable without AWS credentials. |
| <code><a href="#@s-yoshiki/cdk-ses-mail-catcher.ApiAuthorization.AWS_IAM">AWS_IAM</a></code> | Calls must be signed with AWS Signature Version 4. |

---

##### `NONE` <a name="NONE" id="@s-yoshiki/cdk-ses-mail-catcher.ApiAuthorization.NONE"></a>

The API is callable without AWS credentials.

---


##### `AWS_IAM` <a name="AWS_IAM" id="@s-yoshiki/cdk-ses-mail-catcher.ApiAuthorization.AWS_IAM"></a>

Calls must be signed with AWS Signature Version 4.

---

