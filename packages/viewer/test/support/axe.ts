import axe from 'axe-core';

export interface RunAxeOptions {
  /**
   * axe-core rule ids to skip. Use this only for known, accepted issues in
   * the current UI that this phase must not fix, and list them wherever this
   * helper is called.
   */
  readonly disabledRules?: string[];
}

/**
 * Runs axe-core against a container and throws a readable error listing
 * every violation, instead of the default one-line assertion failure.
 */
export const expectNoAxeViolations = async (container: Element, options: RunAxeOptions = {}): Promise<void> => {
  const rules: Record<string, { enabled: boolean }> = {};
  for (const id of options.disabledRules ?? []) {
    rules[id] = { enabled: false };
  }

  const results = await axe.run(container, { rules });

  if (results.violations.length === 0) {
    return;
  }

  const details = results.violations
    .map((violation) => {
      const targets = violation.nodes.map((node) => `      ${node.target.join(' ')}`).join('\n');
      return `  [${violation.id}] ${violation.help} (impact: ${violation.impact ?? 'unknown'})\n${targets}`;
    })
    .join('\n');

  throw new Error(`axe-core found ${results.violations.length} accessibility violation(s):\n${details}`);
};
