const indentContinuationLines = (lines) => lines.map((line) => `  ${line}`).join('\n');

const changelogFunctions = {
  getReleaseLine(changeset) {
    const [firstLine, ...continuationLines] = changeset.summary.split('\n').map((line) => line.trimEnd());
    let releaseLine = `- ${firstLine}`;

    if (continuationLines.length > 0) {
      releaseLine += `\n${indentContinuationLines(continuationLines)}`;
    }

    return releaseLine;
  },

  getDependencyReleaseLine(_changesets, dependenciesUpdated) {
    if (dependenciesUpdated.length === 0) return '';

    return [
      '- Updated dependencies',
      ...dependenciesUpdated.map((dependency) => `  - ${dependency.name}@${dependency.newVersion}`),
    ].join('\n');
  },
};

export default changelogFunctions;
