# API Reference <a name="API Reference" id="api-reference"></a>

## Constructs <a name="Constructs" id="Constructs"></a>

### SesMailCatcher <a name="SesMailCatcher" id="cdk-ses-mail-catcher.SesMailCatcher"></a>

A CDK construct for building an environment that catches emails sent through Amazon SES instead of delivering them to real recipients.

The public construct API is intentionally small while the deployment
architecture is being designed. Mail relay, storage, and viewer resources
will be added in follow-up changes without changing the package identity.

#### Initializers <a name="Initializers" id="cdk-ses-mail-catcher.SesMailCatcher.Initializer"></a>

```typescript
import { SesMailCatcher } from 'cdk-ses-mail-catcher'

new SesMailCatcher(scope: Construct, id: string)
```

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#cdk-ses-mail-catcher.SesMailCatcher.Initializer.parameter.scope">scope</a></code> | <code>constructs.Construct</code> | The scope in which to define this construct. |
| <code><a href="#cdk-ses-mail-catcher.SesMailCatcher.Initializer.parameter.id">id</a></code> | <code>string</code> | The scoped construct ID. |

---

##### `scope`<sup>Required</sup> <a name="scope" id="cdk-ses-mail-catcher.SesMailCatcher.Initializer.parameter.scope"></a>

- *Type:* constructs.Construct

The scope in which to define this construct.

---

##### `id`<sup>Required</sup> <a name="id" id="cdk-ses-mail-catcher.SesMailCatcher.Initializer.parameter.id"></a>

- *Type:* string

The scoped construct ID.

Must be unique amongst siblings. If
the ID includes a path separator (`/`), then it will be replaced by double
dash `--`.

---

#### Methods <a name="Methods" id="Methods"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#cdk-ses-mail-catcher.SesMailCatcher.toString">toString</a></code> | Returns a string representation of this construct. |
| <code><a href="#cdk-ses-mail-catcher.SesMailCatcher.with">with</a></code> | Applies one or more mixins to this construct. |

---

##### `toString` <a name="toString" id="cdk-ses-mail-catcher.SesMailCatcher.toString"></a>

```typescript
public toString(): string
```

Returns a string representation of this construct.

##### `with` <a name="with" id="cdk-ses-mail-catcher.SesMailCatcher.with"></a>

```typescript
public with(mixins: ...IMixin[]): IConstruct
```

Applies one or more mixins to this construct.

Mixins are applied in order. The list of constructs is captured at the
start of the call, so constructs added by a mixin will not be visited.
Use multiple `with()` calls if subsequent mixins should apply to added
constructs.

###### `mixins`<sup>Required</sup> <a name="mixins" id="cdk-ses-mail-catcher.SesMailCatcher.with.parameter.mixins"></a>

- *Type:* ...constructs.IMixin[]

The mixins to apply.

---

#### Static Functions <a name="Static Functions" id="Static Functions"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#cdk-ses-mail-catcher.SesMailCatcher.isConstruct">isConstruct</a></code> | Checks if `x` is a construct. |

---

##### `isConstruct` <a name="isConstruct" id="cdk-ses-mail-catcher.SesMailCatcher.isConstruct"></a>

```typescript
import { SesMailCatcher } from 'cdk-ses-mail-catcher'

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

###### `x`<sup>Required</sup> <a name="x" id="cdk-ses-mail-catcher.SesMailCatcher.isConstruct.parameter.x"></a>

- *Type:* any

Any object.

---

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#cdk-ses-mail-catcher.SesMailCatcher.property.node">node</a></code> | <code>constructs.Node</code> | The tree node. |

---

##### `node`<sup>Required</sup> <a name="node" id="cdk-ses-mail-catcher.SesMailCatcher.property.node"></a>

```typescript
public readonly node: Node;
```

- *Type:* constructs.Node

The tree node.

---





