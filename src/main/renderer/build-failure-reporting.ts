const BUILD_FAILURE_REPORT_THRESHOLD = 3;

interface BuildFailureRecord {
  count: number;
  reported: boolean;
  targetKey: string;
}

const buildFailureRecords = new Map<string, BuildFailureRecord>();

export interface BuildFailureAttempt {
  count: number;
  shouldReport: boolean;
  threshold: number;
}

interface BuildFailureIdentity {
  workspace: string;
  document: string;
  page: string;
  approach: string;
  editMode: boolean;
  stage: string;
  message: string;
}

export function recordBuildFailure(identity: BuildFailureIdentity): BuildFailureAttempt {
  const targetKey = createTargetKey(identity);
  const signature = createSignature(identity);
  const current = buildFailureRecords.get(signature);
  const count = (current?.count ?? 0) + 1;
  const shouldReport = count >= BUILD_FAILURE_REPORT_THRESHOLD && !current?.reported;

  buildFailureRecords.set(signature, {
    count,
    reported: current?.reported === true || shouldReport,
    targetKey,
  });

  return {
    count,
    shouldReport,
    threshold: BUILD_FAILURE_REPORT_THRESHOLD,
  };
}

export function clearBuildFailures(target: Omit<BuildFailureIdentity, 'stage' | 'message'>): void {
  const targetKey = createTargetKey(target);

  for (const [signature, record] of buildFailureRecords.entries()) {
    if (record.targetKey === targetKey) {
      buildFailureRecords.delete(signature);
    }
  }
}

function createTargetKey(target: Omit<BuildFailureIdentity, 'stage' | 'message'>): string {
  return [
    target.workspace,
    target.document,
    target.page,
    target.approach,
    String(target.editMode),
  ].join('::');
}

function createSignature(identity: BuildFailureIdentity): string {
  return [createTargetKey(identity), identity.stage, normalizeMessage(identity.message)].join('::');
}

function normalizeMessage(message: string): string {
  return message.replace(/\s+/g, ' ').trim();
}
