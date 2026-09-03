import { Construct } from 'constructs';

/**
 * A CDK construct for building an environment that catches emails sent
 * through Amazon SES instead of delivering them to real recipients.
 *
 * The public construct API is intentionally small while the deployment
 * architecture is being designed. Mail relay, storage, and viewer resources
 * will be added in follow-up changes without changing the package identity.
 */
export class SesMailCatcher extends Construct {}
