# API Reference <a name="API Reference" id="api-reference"></a>

## Constructs <a name="Constructs" id="Constructs"></a>

### SesMailCatcher <a name="SesMailCatcher" id="@s-yoshiki/cdk-ses-mail-catcher.SesMailCatcher"></a>

A serverless mail catcher for AWS environments.

The construct creates a Lambda function that accepts {@link SendMailEvent }
objects. In catch mode the function writes a canonical raw MIME message to
S3 and an index record to DynamoDB. In relay mode it sends the same raw MIME
message through Amazon SES.

*Example*

```typescript
const catcher = new SesMailCatcher(this, 'MailCatcher');
catcher.grantSend(applicationFunction);
```


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
| <code><a href="#@s-yoshiki/cdk-ses-mail-catcher.SesMailCatcher.grantSend">grantSend</a></code> | Grants an application permission to invoke the mail handler. |

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

##### `grantSend` <a name="grantSend" id="@s-yoshiki/cdk-ses-mail-catcher.SesMailCatcher.grantSend"></a>

```typescript
public grantSend(grantee: IGrantable): void
```

Grants an application permission to invoke the mail handler.

###### `grantee`<sup>Required</sup> <a name="grantee" id="@s-yoshiki/cdk-ses-mail-catcher.SesMailCatcher.grantSend.parameter.grantee"></a>

- *Type:* aws-cdk-lib.aws_iam.IGrantable

the Lambda, role, or other IAM principal that sends events.

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
| <code><a href="#@s-yoshiki/cdk-ses-mail-catcher.SesMailCatcher.property.function">function</a></code> | <code>aws-cdk-lib.aws_lambda.Function</code> | The Lambda function that receives mail events. |
| <code><a href="#@s-yoshiki/cdk-ses-mail-catcher.SesMailCatcher.property.mode">mode</a></code> | <code><a href="#@s-yoshiki/cdk-ses-mail-catcher.MailMode">MailMode</a></code> | The configured mail handling mode. |
| <code><a href="#@s-yoshiki/cdk-ses-mail-catcher.SesMailCatcher.property.table">table</a></code> | <code>aws-cdk-lib.aws_dynamodb.ITable</code> | The message metadata table. |

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

##### `function`<sup>Required</sup> <a name="function" id="@s-yoshiki/cdk-ses-mail-catcher.SesMailCatcher.property.function"></a>

```typescript
public readonly function: Function;
```

- *Type:* aws-cdk-lib.aws_lambda.Function

The Lambda function that receives mail events.

---

##### `mode`<sup>Required</sup> <a name="mode" id="@s-yoshiki/cdk-ses-mail-catcher.SesMailCatcher.property.mode"></a>

```typescript
public readonly mode: MailMode;
```

- *Type:* <a href="#@s-yoshiki/cdk-ses-mail-catcher.MailMode">MailMode</a>

The configured mail handling mode.

---

##### `table`<sup>Required</sup> <a name="table" id="@s-yoshiki/cdk-ses-mail-catcher.SesMailCatcher.property.table"></a>

```typescript
public readonly table: ITable;
```

- *Type:* aws-cdk-lib.aws_dynamodb.ITable

The message metadata table.

---


## Structs <a name="Structs" id="Structs"></a>

### MailAttachment <a name="MailAttachment" id="@s-yoshiki/cdk-ses-mail-catcher.MailAttachment"></a>

A reference to an attachment already stored in Amazon S3.

#### Initializer <a name="Initializer" id="@s-yoshiki/cdk-ses-mail-catcher.MailAttachment.Initializer"></a>

```typescript
import { MailAttachment } from '@s-yoshiki/cdk-ses-mail-catcher'

const mailAttachment: MailAttachment = { ... }
```

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@s-yoshiki/cdk-ses-mail-catcher.MailAttachment.property.bucket">bucket</a></code> | <code>string</code> | The S3 bucket containing the attachment. |
| <code><a href="#@s-yoshiki/cdk-ses-mail-catcher.MailAttachment.property.contentType">contentType</a></code> | <code>string</code> | The MIME content type of the attachment. |
| <code><a href="#@s-yoshiki/cdk-ses-mail-catcher.MailAttachment.property.filename">filename</a></code> | <code>string</code> | The name displayed to the recipient. |
| <code><a href="#@s-yoshiki/cdk-ses-mail-catcher.MailAttachment.property.key">key</a></code> | <code>string</code> | The S3 object key containing the attachment. |

---

##### `bucket`<sup>Required</sup> <a name="bucket" id="@s-yoshiki/cdk-ses-mail-catcher.MailAttachment.property.bucket"></a>

```typescript
public readonly bucket: string;
```

- *Type:* string

The S3 bucket containing the attachment.

---

##### `contentType`<sup>Required</sup> <a name="contentType" id="@s-yoshiki/cdk-ses-mail-catcher.MailAttachment.property.contentType"></a>

```typescript
public readonly contentType: string;
```

- *Type:* string

The MIME content type of the attachment.

---

##### `filename`<sup>Required</sup> <a name="filename" id="@s-yoshiki/cdk-ses-mail-catcher.MailAttachment.property.filename"></a>

```typescript
public readonly filename: string;
```

- *Type:* string

The name displayed to the recipient.

---

##### `key`<sup>Required</sup> <a name="key" id="@s-yoshiki/cdk-ses-mail-catcher.MailAttachment.property.key"></a>

```typescript
public readonly key: string;
```

- *Type:* string

The S3 object key containing the attachment.

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

### RelayOptions <a name="RelayOptions" id="@s-yoshiki/cdk-ses-mail-catcher.RelayOptions"></a>

Optional Amazon SES settings used in relay mode.

#### Initializer <a name="Initializer" id="@s-yoshiki/cdk-ses-mail-catcher.RelayOptions.Initializer"></a>

```typescript
import { RelayOptions } from '@s-yoshiki/cdk-ses-mail-catcher'

const relayOptions: RelayOptions = { ... }
```

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@s-yoshiki/cdk-ses-mail-catcher.RelayOptions.property.configurationSetName">configurationSetName</a></code> | <code>string</code> | The SES configuration set to use. |
| <code><a href="#@s-yoshiki/cdk-ses-mail-catcher.RelayOptions.property.feedbackForwardingEmailAddress">feedbackForwardingEmailAddress</a></code> | <code>string</code> | Where SES should forward feedback notifications. |
| <code><a href="#@s-yoshiki/cdk-ses-mail-catcher.RelayOptions.property.fromEmailAddressIdentityArn">fromEmailAddressIdentityArn</a></code> | <code>string</code> | The ARN of the verified SES identity used by the sender. |

---

##### `configurationSetName`<sup>Optional</sup> <a name="configurationSetName" id="@s-yoshiki/cdk-ses-mail-catcher.RelayOptions.property.configurationSetName"></a>

```typescript
public readonly configurationSetName: string;
```

- *Type:* string

The SES configuration set to use.

---

##### `feedbackForwardingEmailAddress`<sup>Optional</sup> <a name="feedbackForwardingEmailAddress" id="@s-yoshiki/cdk-ses-mail-catcher.RelayOptions.property.feedbackForwardingEmailAddress"></a>

```typescript
public readonly feedbackForwardingEmailAddress: string;
```

- *Type:* string

Where SES should forward feedback notifications.

---

##### `fromEmailAddressIdentityArn`<sup>Optional</sup> <a name="fromEmailAddressIdentityArn" id="@s-yoshiki/cdk-ses-mail-catcher.RelayOptions.property.fromEmailAddressIdentityArn"></a>

```typescript
public readonly fromEmailAddressIdentityArn: string;
```

- *Type:* string

The ARN of the verified SES identity used by the sender.

---

### SendMailEvent <a name="SendMailEvent" id="@s-yoshiki/cdk-ses-mail-catcher.SendMailEvent"></a>

The event accepted by the mail catcher Lambda function.

#### Initializer <a name="Initializer" id="@s-yoshiki/cdk-ses-mail-catcher.SendMailEvent.Initializer"></a>

```typescript
import { SendMailEvent } from '@s-yoshiki/cdk-ses-mail-catcher'

const sendMailEvent: SendMailEvent = { ... }
```

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@s-yoshiki/cdk-ses-mail-catcher.SendMailEvent.property.from">from</a></code> | <code>string</code> | The sender address. |
| <code><a href="#@s-yoshiki/cdk-ses-mail-catcher.SendMailEvent.property.subject">subject</a></code> | <code>string</code> | The subject of the message. |
| <code><a href="#@s-yoshiki/cdk-ses-mail-catcher.SendMailEvent.property.to">to</a></code> | <code>string[]</code> | At least one recipient address. |
| <code><a href="#@s-yoshiki/cdk-ses-mail-catcher.SendMailEvent.property.attachments">attachments</a></code> | <code><a href="#@s-yoshiki/cdk-ses-mail-catcher.MailAttachment">MailAttachment</a>[]</code> | References to large attachments in S3. |
| <code><a href="#@s-yoshiki/cdk-ses-mail-catcher.SendMailEvent.property.bcc">bcc</a></code> | <code>string[]</code> | Blind-carbon-copy recipients. |
| <code><a href="#@s-yoshiki/cdk-ses-mail-catcher.SendMailEvent.property.cc">cc</a></code> | <code>string[]</code> | Carbon-copy recipients. |
| <code><a href="#@s-yoshiki/cdk-ses-mail-catcher.SendMailEvent.property.html">html</a></code> | <code>string</code> | HTML message content. |
| <code><a href="#@s-yoshiki/cdk-ses-mail-catcher.SendMailEvent.property.mailbox">mailbox</a></code> | <code>string</code> | The mailbox partition in which to store the message. |
| <code><a href="#@s-yoshiki/cdk-ses-mail-catcher.SendMailEvent.property.metadata">metadata</a></code> | <code>{[ key: string ]: string}</code> | Arbitrary string metadata stored with the message index. |
| <code><a href="#@s-yoshiki/cdk-ses-mail-catcher.SendMailEvent.property.replyTo">replyTo</a></code> | <code>string[]</code> | Reply-to addresses. |
| <code><a href="#@s-yoshiki/cdk-ses-mail-catcher.SendMailEvent.property.text">text</a></code> | <code>string</code> | Plain-text message content. |

---

##### `from`<sup>Required</sup> <a name="from" id="@s-yoshiki/cdk-ses-mail-catcher.SendMailEvent.property.from"></a>

```typescript
public readonly from: string;
```

- *Type:* string

The sender address.

---

##### `subject`<sup>Required</sup> <a name="subject" id="@s-yoshiki/cdk-ses-mail-catcher.SendMailEvent.property.subject"></a>

```typescript
public readonly subject: string;
```

- *Type:* string

The subject of the message.

---

##### `to`<sup>Required</sup> <a name="to" id="@s-yoshiki/cdk-ses-mail-catcher.SendMailEvent.property.to"></a>

```typescript
public readonly to: string[];
```

- *Type:* string[]

At least one recipient address.

---

##### `attachments`<sup>Optional</sup> <a name="attachments" id="@s-yoshiki/cdk-ses-mail-catcher.SendMailEvent.property.attachments"></a>

```typescript
public readonly attachments: MailAttachment[];
```

- *Type:* <a href="#@s-yoshiki/cdk-ses-mail-catcher.MailAttachment">MailAttachment</a>[]

References to large attachments in S3.

---

##### `bcc`<sup>Optional</sup> <a name="bcc" id="@s-yoshiki/cdk-ses-mail-catcher.SendMailEvent.property.bcc"></a>

```typescript
public readonly bcc: string[];
```

- *Type:* string[]

Blind-carbon-copy recipients.

---

##### `cc`<sup>Optional</sup> <a name="cc" id="@s-yoshiki/cdk-ses-mail-catcher.SendMailEvent.property.cc"></a>

```typescript
public readonly cc: string[];
```

- *Type:* string[]

Carbon-copy recipients.

---

##### `html`<sup>Optional</sup> <a name="html" id="@s-yoshiki/cdk-ses-mail-catcher.SendMailEvent.property.html"></a>

```typescript
public readonly html: string;
```

- *Type:* string

HTML message content.

---

##### `mailbox`<sup>Optional</sup> <a name="mailbox" id="@s-yoshiki/cdk-ses-mail-catcher.SendMailEvent.property.mailbox"></a>

```typescript
public readonly mailbox: string;
```

- *Type:* string
- *Default:* default

The mailbox partition in which to store the message.

---

##### `metadata`<sup>Optional</sup> <a name="metadata" id="@s-yoshiki/cdk-ses-mail-catcher.SendMailEvent.property.metadata"></a>

```typescript
public readonly metadata: {[ key: string ]: string};
```

- *Type:* {[ key: string ]: string}

Arbitrary string metadata stored with the message index.

---

##### `replyTo`<sup>Optional</sup> <a name="replyTo" id="@s-yoshiki/cdk-ses-mail-catcher.SendMailEvent.property.replyTo"></a>

```typescript
public readonly replyTo: string[];
```

- *Type:* string[]

Reply-to addresses.

---

##### `text`<sup>Optional</sup> <a name="text" id="@s-yoshiki/cdk-ses-mail-catcher.SendMailEvent.property.text"></a>

```typescript
public readonly text: string;
```

- *Type:* string

Plain-text message content.

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
| <code><a href="#@s-yoshiki/cdk-ses-mail-catcher.SesMailCatcherProps.property.mode">mode</a></code> | <code><a href="#@s-yoshiki/cdk-ses-mail-catcher.MailMode">MailMode</a></code> | How incoming events are handled. |
| <code><a href="#@s-yoshiki/cdk-ses-mail-catcher.SesMailCatcherProps.property.relay">relay</a></code> | <code><a href="#@s-yoshiki/cdk-ses-mail-catcher.RelayOptions">RelayOptions</a></code> | Optional settings for relay mode. |
| <code><a href="#@s-yoshiki/cdk-ses-mail-catcher.SesMailCatcherProps.property.retention">retention</a></code> | <code>aws-cdk-lib.Duration</code> | How long captured messages remain available. |
| <code><a href="#@s-yoshiki/cdk-ses-mail-catcher.SesMailCatcherProps.property.storage">storage</a></code> | <code><a href="#@s-yoshiki/cdk-ses-mail-catcher.MailStorage">MailStorage</a></code> | Existing or custom storage resources. |

---

##### `mode`<sup>Optional</sup> <a name="mode" id="@s-yoshiki/cdk-ses-mail-catcher.SesMailCatcherProps.property.mode"></a>

```typescript
public readonly mode: MailMode;
```

- *Type:* <a href="#@s-yoshiki/cdk-ses-mail-catcher.MailMode">MailMode</a>
- *Default:* MailMode.CATCH

How incoming events are handled.

---

##### `relay`<sup>Optional</sup> <a name="relay" id="@s-yoshiki/cdk-ses-mail-catcher.SesMailCatcherProps.property.relay"></a>

```typescript
public readonly relay: RelayOptions;
```

- *Type:* <a href="#@s-yoshiki/cdk-ses-mail-catcher.RelayOptions">RelayOptions</a>

Optional settings for relay mode.

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



## Enums <a name="Enums" id="Enums"></a>

### MailMode <a name="MailMode" id="@s-yoshiki/cdk-ses-mail-catcher.MailMode"></a>

The way the mail catcher handles an incoming mail event.

#### Members <a name="Members" id="Members"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@s-yoshiki/cdk-ses-mail-catcher.MailMode.CATCH">CATCH</a></code> | Store the message in DynamoDB and S3 without sending it. |
| <code><a href="#@s-yoshiki/cdk-ses-mail-catcher.MailMode.RELAY">RELAY</a></code> | Forward the message to Amazon SES. |

---

##### `CATCH` <a name="CATCH" id="@s-yoshiki/cdk-ses-mail-catcher.MailMode.CATCH"></a>

Store the message in DynamoDB and S3 without sending it.

---


##### `RELAY` <a name="RELAY" id="@s-yoshiki/cdk-ses-mail-catcher.MailMode.RELAY"></a>

Forward the message to Amazon SES.

---
