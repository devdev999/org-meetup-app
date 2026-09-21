# Interest splits preserve later choices

Each merge stores its original Aliases, declarations and relevant Interests, with a sequence value that distinguishes an explicit change even when the Stance and clock time stay the same. A split restores only unchanged rows and their original order, avoiding a full history of every Member action. Later merges involving the same Interests must be split first so that an earlier split cannot revive a declaration removed or edited after a dependent merge.

Existing declarations have no recoverable order. Their revision remains zero; tied legacy declarations prefer the survivor's Stance, then the lowest Interest identifier, while preserving every original declaration for an untouched split.

A recurring Event approved during a merge inherits its proposal's attachment revisions and merge snapshots. Approval preserves the Host's original choices, so a later split can restore the series used for future occurrences.
