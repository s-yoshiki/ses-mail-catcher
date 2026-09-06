/** @internal */
export interface AttributeValue {
  readonly S?: string;
  readonly N?: string;
  readonly L?: AttributeValue[];
  readonly M?: Record<string, AttributeValue>;
}
