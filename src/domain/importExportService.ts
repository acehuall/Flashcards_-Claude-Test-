import { db } from '../db';
import type { ActiveSession, Card, FlashSet, Outcome, Pack, Result, Session, SessionMode, Stat } from './types';
import type {
  ExportOptions,
  ExportScope,
  IdentityMode,
  ImportConflict,
  ImportMode,
  ImportPlan,
  ImportPreview,
  ImportWarning,
  PortableCard,
  PortableLibrary,
  PortablePack,
  PortableResult,
  PortableSession,
  PortableSet,
  PortableStat,
} from './transferTypes';

const APP_IDENTIFIER = 'flashcard-app';
const SUPPORTED_VERSION = 2;
const IMPORT_RUNTIME_META_KEY = '__importRuntimeMeta';

type PortableSetPayload = {
  set: PortableSet;
  stats: PortableStat[];
  sessions: PortableSession[];
  results: PortableResult[];
};

type PortablePackPayload = {
  pack: PortablePack;
  stats: PortableStat[];
  sessions: PortableSession[];
  results: PortableResult[];
};

type PortableImportData = PortableSetPayload | PortablePackPayload | PortableLibrary;

type PortableImportFile = {
  app: typeof APP_IDENTIFIER;
  version: typeof SUPPORTED_VERSION;
  scope: ExportScope;
  exportedAt: number;
  includeStats: boolean;
  includeSessions: boolean;
  identityMode: IdentityMode;
  data: PortableImportData;
};

type SetImportPlan = ImportPlan & {
  file: PortableImportFile;
  targetPackId?: number;
};

type ImportPreviewTarget = {
  targetPackId?: number;
  targetLabel?: string;
  currentPackName?: string;
};

type ImportState = {
  packs: Pack[];
  sets: FlashSet[];
  cards: Card[];
  sessions: Session[];
  activeSessions: ActiveSession[];
  packsByPortableId: Map<string, Pack>;
  packsByNormalisedName: Map<string, Pack[]>;
  setsByPortableId: Map<string, FlashSet>;
  setsByPackId: Map<number, FlashSet[]>;
  setsByPackAndNormalisedTitle: Map<number, Map<string, FlashSet[]>>;
  cardsByPortableId: Map<string, Card>;
  cardsBySetId: Map<number, Card[]>;
  sessionsByPortableId: Map<string, Session>;
  activeSessionsBySetId: Map<number, ActiveSession>;
};

type AnalysisPlan = SetImportPlan & {
  existingState: ImportState;
  target?: ImportPreviewTarget;
};

type MatchMethod = 'portableId' | 'heuristic';

type EntityMatch<T> = {
  entity?: T;
  matchedBy?: MatchMethod;
  ambiguousMatches?: T[];
};

type CardMatchResult =
  | {
      outcome: 'create';
    }
  | {
      outcome: 'duplicate';
      existingCard: Card;
      matchedBy: MatchMethod;
    }
  | {
      outcome: 'conflict';
      existingCard: Card;
      matchedBy: MatchMethod;
      reason: 'portableId-changed-content' | 'same-question-different-answer';
    };

type RuntimeImportConflict = ImportConflict & {
  code: string;
  blocking?: boolean;
  appliesTo?: ImportMode[];
  matchedBy?: 'heuristic';
};

type AffectedActiveSession = {
  setId: number;
  title: string;
  packName?: string;
};

type RuntimeImportPreview = Omit<ImportPreview, 'affectedActiveSessions'> & {
  affectedActiveSessions: AffectedActiveSession[];
};

type ImportAnalysis = {
  duplicates: number;
  conflicts: RuntimeImportConflict[];
  warnings: ImportWarning[];
  affectedActiveSessions: AffectedActiveSession[];
  plannedCreates: number;
  plannedMerges: number;
  plannedReplacements: number;
  supplementalSummary: SupplementalImportSummary;
  matchedRootPack?: Pack;
  matchedRootSet?: FlashSet;
};

type ImportFileRuntimeMeta = {
  warnings: ImportWarning[];
};

type ImportedCardTarget = {
  localId: number;
  created: boolean;
};

type ImportExecutionContext = {
  existingState: ImportState;
  setIds: Map<string, number>;
  cardTargets: Map<string, ImportedCardTarget>;
  sessionIds: Map<string, number>;
};

type SupplementalImportSummary = {
  statsToImport: number;
  recomputedStatsCount: number;
  sessionsToImport: number;
  resultsToImport: number;
  duplicateSessions: number;
  skippedResults: number;
  warnings: ImportWarning[];
};

type RuntimeImportPreviewMeta = {
  sourceFile: PortableImportFile;
  fileContainsStats: boolean;
  fileContainsSessions: boolean;
  supplementalByMode: Record<ImportMode, SupplementalImportSummary>;
};

type RuntimeImportPreviewWithMeta = RuntimeImportPreview & RuntimeImportPreviewMeta;

type PortableCollections = {
  packs: PortablePack[];
  sets: PortableSet[];
  cards: PortableCard[];
  stats: PortableStat[];
  sessions: PortableSession[];
  results: PortableResult[];
};

export function normaliseCardText(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, ' ');
}

export function exportSetToJson(
  set: Pick<FlashSet, 'id' | 'portableId' | 'title' | 'description' | 'createdAt'>,
  cards: Array<Pick<Card, 'id' | 'portableId' | 'question' | 'answer' | 'createdAt'>>,
  options: ExportOptions = { includeStats: false, includeSessions: false },
): void | Promise<void> {
  if (set.id == null) {
    throw new Error('Set must be saved before it can be exported.');
  }

  const missingCardId = cards.some((card) => card.id == null);
  if (missingCardId) {
    throw new Error('All cards must be saved before exporting set JSON.');
  }

  const portableSet: PortableSet = {
    sourceId: set.id,
    portableId: set.portableId,
    title: set.title,
    description: set.description,
    createdAt: set.createdAt,
    cards: cards.map<PortableCard>((card) => ({
      sourceId: card.id!,
      portableId: card.portableId,
      question: card.question,
      answer: card.answer,
      createdAt: card.createdAt,
    })),
  };

  const identityMode: IdentityMode = [set, ...cards].every((entity) => Boolean(entity.portableId))
    ? 'portable'
    : 'heuristic';

  if (!options.includeStats && !options.includeSessions) {
    const payload: PortableImportFile = {
      app: APP_IDENTIFIER,
      version: SUPPORTED_VERSION,
      scope: 'set',
      exportedAt: Date.now(),
      includeStats: false,
      includeSessions: false,
      identityMode,
      data: {
        set: portableSet,
        stats: [],
        sessions: [],
        results: [],
      },
    };

    downloadJsonFile(`${toFileStem(set.title)}_set.json`, payload);
    return;
  }

  return db.transaction('r', [db.sets, db.cards, db.stats, db.sessions, db.results], async () => {
    const cardList = cards.map((card) => ({
      id: card.id!,
      portableId: card.portableId,
      question: card.question,
      answer: card.answer,
      createdAt: card.createdAt,
    }));
    const supplemental = await buildExportSupplementalData([set.id!], cardList, options);
    const payload: PortableImportFile = {
      app: APP_IDENTIFIER,
      version: SUPPORTED_VERSION,
      scope: 'set',
      exportedAt: Date.now(),
      includeStats: options.includeStats,
      includeSessions: options.includeSessions,
      identityMode: getIdentityMode([...cardList, set, ...supplemental.sessions]),
      data: {
        set: portableSet,
        stats: supplemental.stats,
        sessions: supplemental.sessions,
        results: supplemental.results,
      },
    };

    downloadJsonFile(`${toFileStem(set.title)}_set.json`, payload);
  });
}

export async function exportPackToJson(packId: number, options: ExportOptions): Promise<void> {
  const payload: PortableImportFile = await db.transaction(
    'r',
    [db.packs, db.sets, db.cards, db.stats, db.sessions, db.results],
    async (): Promise<PortableImportFile> => {
    const pack = await db.packs.get(packId);
    if (!pack || pack.id == null) {
      throw new Error('Pack was not found.');
    }

    const sets = await db.sets.where('packId').equals(packId).sortBy('createdAt');
    const setIds = sets.flatMap((set) => (set.id == null ? [] : [set.id]));
    const cards = setIds.length > 0
      ? await db.cards.where('setId').anyOf(setIds).sortBy('createdAt')
      : [];
    const cardsBySetId = groupCardsBySetId(cards);
    const supplemental = await buildExportSupplementalData(setIds, cards, options);

    const portablePack: PortablePack = {
      sourceId: pack.id,
      portableId: pack.portableId,
      name: pack.name,
      color: pack.color,
      createdAt: pack.createdAt,
      sets: sets.map<PortableSet>((set) => ({
        sourceId: set.id!,
        portableId: set.portableId,
        title: set.title,
        description: set.description,
        createdAt: set.createdAt,
        cards: (cardsBySetId.get(set.id!) ?? []).map<PortableCard>((card) => ({
          sourceId: card.id!,
          portableId: card.portableId,
          question: card.question,
          answer: card.answer,
          createdAt: card.createdAt,
        })),
      })),
    };

    return {
      app: APP_IDENTIFIER,
      version: SUPPORTED_VERSION,
      scope: 'pack' as const,
      exportedAt: Date.now(),
      includeStats: options.includeStats,
      includeSessions: options.includeSessions,
      identityMode: getIdentityMode([pack, ...sets, ...cards, ...supplemental.sessions]),
      data: {
        pack: portablePack,
        stats: supplemental.stats,
        sessions: supplemental.sessions,
        results: supplemental.results,
      },
    };
  });

  downloadJsonFile(`${toFileStem(getPortablePackPayload(payload).pack.name)}_pack.json`, payload);
}

export async function exportLibraryToJson(options: ExportOptions): Promise<void> {
  const payload: PortableImportFile = await db.transaction(
    'r',
    [db.packs, db.sets, db.cards, db.stats, db.sessions, db.results],
    async (): Promise<PortableImportFile> => {
    const [packs, sets, cards] = await Promise.all([
      db.packs.orderBy('createdAt').toArray(),
      db.sets.orderBy('createdAt').toArray(),
      db.cards.orderBy('createdAt').toArray(),
    ]);

    const setsByPackId = new Map<number, FlashSet[]>();
    for (const set of sets) {
      const existing = setsByPackId.get(set.packId);
      if (existing) {
        existing.push(set);
      } else {
        setsByPackId.set(set.packId, [set]);
      }
    }

    const cardsBySetId = groupCardsBySetId(cards);
    const setIds = sets.flatMap((set) => (set.id == null ? [] : [set.id]));
    const supplemental = await buildExportSupplementalData(setIds, cards, options);

    return {
      app: APP_IDENTIFIER,
      version: SUPPORTED_VERSION,
      scope: 'library' as const,
      exportedAt: Date.now(),
      includeStats: options.includeStats,
      includeSessions: options.includeSessions,
      identityMode: getIdentityMode([...packs, ...sets, ...cards, ...supplemental.sessions]),
      data: {
        packs: packs.map<PortablePack>((pack) => ({
          sourceId: pack.id!,
          portableId: pack.portableId,
          name: pack.name,
          color: pack.color,
          createdAt: pack.createdAt,
          sets: (setsByPackId.get(pack.id!) ?? []).map<PortableSet>((set) => ({
            sourceId: set.id!,
            portableId: set.portableId,
            title: set.title,
            description: set.description,
            createdAt: set.createdAt,
            cards: (cardsBySetId.get(set.id!) ?? []).map<PortableCard>((card) => ({
              sourceId: card.id!,
              portableId: card.portableId,
              question: card.question,
              answer: card.answer,
              createdAt: card.createdAt,
            })),
          })),
        })),
        stats: supplemental.stats,
        sessions: supplemental.sessions,
        results: supplemental.results,
      },
    };
  });

  downloadJsonFile('flashcard_library.json', payload);
}

export async function parseImportFile(file: File): Promise<PortableImportFile> {
  const text = await file.text();

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Import file is not valid JSON.');
  }

  return validateImportFile(parsed);
}

export function validateImportFile(input: unknown, target?: number | ImportPreviewTarget): PortableImportFile {
  const record = expectRecord(input, 'Import file is missing required fields.');

  expectString(record.app, 'app');
  expectNumber(record.version, 'version');

  if (record.app !== APP_IDENTIFIER) {
    throw new Error('Import file is for a different app.');
  }

  if (record.version !== SUPPORTED_VERSION) {
    throw new Error(`Import file version ${String(record.version)} is not supported.`);
  }

  if (!isExportScope(record.scope)) {
    throw new Error('Import file is missing required field "scope".');
  }

  if (!isNumber(record.exportedAt)) {
    throw new Error('Import file is missing required field "exportedAt".');
  }

  if (typeof record.includeStats !== 'boolean') {
    throw new Error('Import file is missing required field "includeStats".');
  }

  if (typeof record.includeSessions !== 'boolean') {
    throw new Error('Import file is missing required field "includeSessions".');
  }

  if (!isIdentityMode(record.identityMode)) {
    throw new Error('Import file is missing required field "identityMode".');
  }

  const data = expectRecord(record.data, 'Import file is missing required field "data".');

  switch (record.scope) {
    case 'set':
      validateSetPayload(data);
      break;
    case 'pack':
      validatePackPayload(data);
      break;
    case 'library':
      validateLibraryPayload(data);
      break;
  }

  const importFile = record as PortableImportFile;
  const previewTarget = typeof target === 'number' ? { targetPackId: target } : target;
  validateScopeTargetCompatibility(importFile, previewTarget);
  setImportRuntimeMeta(importFile, {
    warnings: validateImportRelationships(importFile),
  });

  return importFile;
}

export async function buildImportPreview(file: PortableSet, targetPackId: number): Promise<ImportPreview>;
export async function buildImportPreview(file: PortableImportFile, targetPackId: number): Promise<ImportPreview>;
export async function buildImportPreview(file: PortableImportFile, target?: ImportPreviewTarget): Promise<ImportPreview>;
export async function buildImportPreview(
  file: PortableSet | PortableImportFile,
  target: number | ImportPreviewTarget = {},
): Promise<ImportPreview> {
  const importFile = toPortableImportFile(file);
  const previewTarget = typeof target === 'number' ? { targetPackId: target } : target;
  validateImportFile(importFile, previewTarget);

  return db.transaction('r', [db.packs, db.sets, db.cards, db.sessions, db.activeSessions], async () => {
    const existingState = await loadImportState();
    return createPreviewFromState(importFile, previewTarget, existingState);
  });
}

export function detectImportConflicts(plan: ImportPlan): ImportConflict[] {
  const analysisPlan = plan as Partial<AnalysisPlan>;

  if (!analysisPlan.file || !analysisPlan.existingState) {
    throw new Error('Import conflict detection requires a prepared import plan.');
  }

  return analyzeImportPlan(analysisPlan as AnalysisPlan).conflicts;
}

export async function executeImport(plan: ImportPlan): Promise<void> {
  const importPlan = plan as SetImportPlan;
  const importFile = importPlan.file;

  if (!importFile) {
    throw new Error('Import plan is missing import file data.');
  }

  if (importFile.scope === 'library' && importPlan.mode === 'replace') {
    throw new Error('Library Replace is not supported.');
  }

  await db.transaction(
    'rw',
    [db.packs, db.sets, db.cards, db.sessions, db.results, db.stats, db.activeSessions],
    async () => {
      const existingState = await loadImportState();
      const analysisPlan: AnalysisPlan = {
        ...importPlan,
        existingState,
      };
      const analysis = analyzeImportPlan(analysisPlan);
      const blockingConflict = getBlockingConflictForMode(analysis.conflicts, importPlan.mode);

      if (blockingConflict) {
        throw new Error(blockingConflict.message);
      }

      let executionContext: ImportExecutionContext;
      switch (importPlan.mode) {
        case 'copy':
          executionContext = await executeCopyImport(importPlan, existingState);
          break;
        case 'merge':
          executionContext = await executeMergeImport(importPlan, existingState);
          break;
        case 'replace':
          executionContext = await executeReplaceImport(importPlan, existingState, analysis);
          break;
      }

      await importSupplementalData(importPlan, executionContext);
    },
  );
}

function createImportExecutionContext(existingState: ImportState): ImportExecutionContext {
  return {
    existingState,
    setIds: new Map<string, number>(),
    cardTargets: new Map<string, ImportedCardTarget>(),
    sessionIds: new Map<string, number>(),
  };
}

async function importSupplementalData(importPlan: SetImportPlan, context: ImportExecutionContext): Promise<void> {
  const collections = getPortableCollections(importPlan.file);
  if (importPlan.file.includeSessions) {
    const importedResults = await importSessionsAndResults(
      collections.sessions,
      collections.results,
      importPlan.mode,
      importPlan.file.identityMode === 'portable',
      context,
    );
    const stats = recomputeStatsFromResults(importedResults, projectCardIdMap(context.cardTargets));
    await applyRecomputedStats(stats);
    return;
  }

  if (!importPlan.file.includeStats) {
    return;
  }

  await importStandaloneStats(collections.stats, importPlan.mode, context);
}

async function importSessionsAndResults(
  sessions: PortableSession[],
  results: PortableResult[],
  mode: ImportMode,
  preservePortableIds: boolean,
  context: ImportExecutionContext,
): Promise<PortableResult[]> {
  for (const portableSession of sessions) {
    const setId = resolveMappedId(context.setIds, portableSession.setSourceId, portableSession.setPortableId);
    if (setId == null) {
      continue;
    }

    if (mode === 'merge' && portableSession.portableId && context.existingState.sessionsByPortableId.has(portableSession.portableId)) {
      continue;
    }

    const portableId = resolvePortableId(
      portableSession.portableId,
      preservePortableIds,
      context.existingState.sessionsByPortableId,
    );
    const sessionId = await db.sessions.add({
      portableId,
      setId,
      startedAt: portableSession.startedAt,
      completedAt: portableSession.completedAt,
      score: portableSession.score,
      mode: portableSession.mode,
    });

    registerEntityId(context.sessionIds, portableSession.sourceId, portableSession.portableId, sessionId);
    addSessionToState(context.existingState, {
      id: sessionId,
      portableId,
      setId,
      startedAt: portableSession.startedAt,
      completedAt: portableSession.completedAt,
      score: portableSession.score,
      mode: portableSession.mode,
    });
  }

  const insertedResults: PortableResult[] = [];
  const resultRows: Array<Omit<Result, 'id'>> = [];

  for (const portableResult of results) {
    const sessionId = resolveMappedId(context.sessionIds, portableResult.sessionSourceId, portableResult.sessionPortableId);
    if (sessionId == null) {
      continue;
    }

    const cardTarget = resolveCardTarget(context.cardTargets, portableResult.cardSourceId, portableResult.cardPortableId);
    if (!cardTarget) {
      continue;
    }

    resultRows.push({
      sessionId,
      cardId: cardTarget.localId,
      outcome: portableResult.outcome,
      timestamp: portableResult.timestamp,
    });
    insertedResults.push(portableResult);
  }

  if (resultRows.length > 0) {
    await db.results.bulkAdd(resultRows);
  }

  return insertedResults;
}

async function importStandaloneStats(
  stats: PortableStat[],
  mode: ImportMode,
  context: ImportExecutionContext,
): Promise<void> {
  const rows: Omit<Stat, 'id'>[] = [];

  for (const portableStat of stats) {
    const cardTarget = resolveCardTarget(context.cardTargets, portableStat.cardSourceId, portableStat.cardPortableId);
    if (!cardTarget) {
      continue;
    }

    if (mode === 'merge' && !cardTarget.created) {
      continue;
    }

    rows.push({
      cardId: cardTarget.localId,
      correctCount: portableStat.correctCount,
      incorrectCount: portableStat.incorrectCount,
      flaggedCount: portableStat.flaggedCount,
      lastResult: portableStat.lastResult,
      lastReviewedAt: portableStat.lastReviewedAt,
    });
  }

  if (rows.length > 0) {
    await db.stats.bulkAdd(rows);
  }
}

async function applyRecomputedStats(stats: Omit<Stat, 'id'>[]): Promise<void> {
  for (const stat of stats) {
    const existing = await db.stats.where('cardId').equals(stat.cardId).first();
    if (!existing) {
      await db.stats.add(stat);
      continue;
    }

    const importedIsLatest = (existing.lastReviewedAt ?? 0) <= (stat.lastReviewedAt ?? 0);
    await db.stats.update(existing.id!, {
      correctCount: existing.correctCount + stat.correctCount,
      incorrectCount: existing.incorrectCount + stat.incorrectCount,
      flaggedCount: existing.flaggedCount + stat.flaggedCount,
      lastReviewedAt: importedIsLatest ? stat.lastReviewedAt : existing.lastReviewedAt,
      lastResult: importedIsLatest ? stat.lastResult : existing.lastResult,
    });
  }
}

function validateSetPayload(data: Record<string, unknown>): void {
  validatePortableSet(expectRecord(data.set, 'Import file is missing required field "data.set".'), 'data.set');
  expectArray(data.stats, 'Import file is missing required field "data.stats".').forEach((stat, index) => {
    validatePortableStat(expectRecord(stat, `Import file has malformed stat data at data.stats[${index}].`), `data.stats[${index}]`);
  });
  expectArray(data.sessions, 'Import file is missing required field "data.sessions".').forEach((session, index) => {
    validatePortableSession(expectRecord(session, `Import file has malformed session data at data.sessions[${index}].`), `data.sessions[${index}]`);
  });
  expectArray(data.results, 'Import file is missing required field "data.results".').forEach((result, index) => {
    validatePortableResult(expectRecord(result, `Import file has malformed result data at data.results[${index}].`), `data.results[${index}]`);
  });
}

function validatePackPayload(data: Record<string, unknown>): void {
  validatePortablePack(expectRecord(data.pack, 'Import file is missing required field "data.pack".'), 'data.pack');
  expectArray(data.stats, 'Import file is missing required field "data.stats".').forEach((stat, index) => {
    validatePortableStat(expectRecord(stat, `Import file has malformed stat data at data.stats[${index}].`), `data.stats[${index}]`);
  });
  expectArray(data.sessions, 'Import file is missing required field "data.sessions".').forEach((session, index) => {
    validatePortableSession(expectRecord(session, `Import file has malformed session data at data.sessions[${index}].`), `data.sessions[${index}]`);
  });
  expectArray(data.results, 'Import file is missing required field "data.results".').forEach((result, index) => {
    validatePortableResult(expectRecord(result, `Import file has malformed result data at data.results[${index}].`), `data.results[${index}]`);
  });
}

function validateLibraryPayload(data: Record<string, unknown>): void {
  const packs = expectArray(data.packs, 'Import file is missing required field "data.packs".');
  expectArray(data.stats, 'Import file is missing required field "data.stats".').forEach((stat, index) => {
    validatePortableStat(expectRecord(stat, `Import file has malformed stat data at data.stats[${index}].`), `data.stats[${index}]`);
  });
  expectArray(data.sessions, 'Import file is missing required field "data.sessions".').forEach((session, index) => {
    validatePortableSession(expectRecord(session, `Import file has malformed session data at data.sessions[${index}].`), `data.sessions[${index}]`);
  });
  expectArray(data.results, 'Import file is missing required field "data.results".').forEach((result, index) => {
    validatePortableResult(expectRecord(result, `Import file has malformed result data at data.results[${index}].`), `data.results[${index}]`);
  });

  packs.forEach((pack, index) => {
    validatePortablePack(expectRecord(pack, `Import file has malformed pack data at data.packs[${index}].`), `data.packs[${index}]`);
  });
}

function validatePortablePack(pack: Record<string, unknown>, path: string): void {
  expectNumber(pack.sourceId, `${path}.sourceId`);
  expectOptionalString(pack.portableId, `${path}.portableId`);
  expectString(pack.name, `${path}.name`);
  expectString(pack.color, `${path}.color`);
  expectNumber(pack.createdAt, `${path}.createdAt`);

  const sets = expectArray(pack.sets, `Import file is missing required field "${path}.sets".`);
  sets.forEach((set, index) => {
    validatePortableSet(expectRecord(set, `Import file has malformed set data at ${path}.sets[${index}].`), `${path}.sets[${index}]`);
  });
}

function validatePortableSet(set: Record<string, unknown>, path: string): void {
  expectNumber(set.sourceId, `${path}.sourceId`);
  expectOptionalString(set.portableId, `${path}.portableId`);
  expectString(set.title, `${path}.title`);
  expectOptionalString(set.description, `${path}.description`);
  expectNumber(set.createdAt, `${path}.createdAt`);

  const cards = expectArray(set.cards, 'Import file has a malformed cards array.');
  cards.forEach((card, index) => {
    validatePortableCard(expectRecord(card, `Import file has malformed card data at ${path}.cards[${index}].`), `${path}.cards[${index}]`);
  });
}

function validatePortableCard(card: Record<string, unknown>, path: string): void {
  expectNumber(card.sourceId, `${path}.sourceId`);
  expectOptionalString(card.portableId, `${path}.portableId`);
  expectString(card.question, `${path}.question`);
  expectString(card.answer, `${path}.answer`);
  expectNumber(card.createdAt, `${path}.createdAt`);
}

function validatePortableSession(session: Record<string, unknown>, path: string): void {
  expectNumber(session.sourceId, `${path}.sourceId`);
  expectOptionalString(session.portableId, `${path}.portableId`);
  expectNumber(session.setSourceId, `${path}.setSourceId`);
  expectOptionalString(session.setPortableId, `${path}.setPortableId`);
  expectNumber(session.startedAt, `${path}.startedAt`);
  expectOptionalNumber(session.completedAt, `${path}.completedAt`);
  expectOptionalNumber(session.score, `${path}.score`);
  expectSessionMode(session.mode, `${path}.mode`);
}

function validatePortableResult(result: Record<string, unknown>, path: string): void {
  expectNumber(result.sourceId, `${path}.sourceId`);
  expectNumber(result.sessionSourceId, `${path}.sessionSourceId`);
  expectOptionalString(result.sessionPortableId, `${path}.sessionPortableId`);
  expectNumber(result.cardSourceId, `${path}.cardSourceId`);
  expectOptionalString(result.cardPortableId, `${path}.cardPortableId`);
  expectOutcome(result.outcome, `${path}.outcome`);
  expectNumber(result.timestamp, `${path}.timestamp`);
}

function validatePortableStat(stat: Record<string, unknown>, path: string): void {
  expectNumber(stat.cardSourceId, `${path}.cardSourceId`);
  expectOptionalString(stat.cardPortableId, `${path}.cardPortableId`);
  expectNumber(stat.correctCount, `${path}.correctCount`);
  expectNumber(stat.incorrectCount, `${path}.incorrectCount`);
  expectNumber(stat.flaggedCount, `${path}.flaggedCount`);
  expectOptionalOutcome(stat.lastResult, `${path}.lastResult`);
  expectOptionalNumber(stat.lastReviewedAt, `${path}.lastReviewedAt`);
}

function expectRecord(value: unknown, message: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(message);
  }

  return value;
}

function expectArray(value: unknown, message: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(message);
  }

  return value;
}

function expectString(value: unknown, fieldName: string): void {
  if (typeof value !== 'string') {
    throw new Error(`Import file is missing required field "${fieldName}".`);
  }
}

function expectOptionalString(value: unknown, fieldName: string): void {
  if (value != null && typeof value !== 'string') {
    throw new Error(`Import file has invalid field "${fieldName}".`);
  }
}

function expectNumber(value: unknown, fieldName: string): void {
  if (!isNumber(value)) {
    throw new Error(`Import file is missing required field "${fieldName}".`);
  }
}

function expectOptionalNumber(value: unknown, fieldName: string): void {
  if (value != null && !isNumber(value)) {
    throw new Error(`Import file has invalid field "${fieldName}".`);
  }
}

function expectOutcome(value: unknown, fieldName: string): void {
  if (!isOutcome(value)) {
    throw new Error(`Import file has invalid field "${fieldName}".`);
  }
}

function expectOptionalOutcome(value: unknown, fieldName: string): void {
  if (value != null && !isOutcome(value)) {
    throw new Error(`Import file has invalid field "${fieldName}".`);
  }
}

function expectSessionMode(value: unknown, fieldName: string): void {
  if (!isSessionMode(value)) {
    throw new Error(`Import file has invalid field "${fieldName}".`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isExportScope(value: unknown): value is ExportScope {
  return value === 'set' || value === 'pack' || value === 'library';
}

function isIdentityMode(value: unknown): value is IdentityMode {
  return value === 'portable' || value === 'heuristic';
}

function isOutcome(value: unknown): value is Outcome {
  return value === 'correct' || value === 'incorrect' || value === 'flagged';
}

function isSessionMode(value: unknown): value is SessionMode {
  return value === 'full' || value === 'flagged' || value === 'incorrect-only';
}

function getPortableSetPayload(file: PortableImportFile): PortableSetPayload {
  if (file.scope !== 'set') {
    throw new Error('Only Set JSON imports are supported right now.');
  }

  return file.data as PortableSetPayload;
}

function getPortablePackPayload(file: PortableImportFile): PortablePackPayload {
  if (file.scope !== 'pack') {
    throw new Error('Import file does not contain pack data.');
  }

  return file.data as PortablePackPayload;
}

function getPortableLibraryPayload(file: PortableImportFile): PortableLibrary {
  if (file.scope !== 'library') {
    throw new Error('Import file does not contain library data.');
  }

  return file.data as PortableLibrary;
}

function getPortableCollections(file: PortableImportFile): PortableCollections {
  switch (file.scope) {
    case 'set': {
      const payload = getPortableSetPayload(file);
      return {
        packs: [],
        sets: [payload.set],
        cards: [...payload.set.cards],
        stats: payload.stats,
        sessions: payload.sessions,
        results: payload.results,
      };
    }
    case 'pack': {
      const payload = getPortablePackPayload(file);
      return {
        packs: [payload.pack],
        sets: [...payload.pack.sets],
        cards: payload.pack.sets.flatMap((set) => set.cards),
        stats: payload.stats,
        sessions: payload.sessions,
        results: payload.results,
      };
    }
    case 'library': {
      const payload = getPortableLibraryPayload(file);
      return {
        packs: payload.packs,
        sets: payload.packs.flatMap((pack) => pack.sets),
        cards: payload.packs.flatMap((pack) => pack.sets.flatMap((set) => set.cards)),
        stats: payload.stats,
        sessions: payload.sessions,
        results: payload.results,
      };
    }
  }
}

function validateScopeTargetCompatibility(file: PortableImportFile, target?: ImportPreviewTarget): void {
  if (!target) {
    return;
  }

  if (file.scope === 'set' && target.targetPackId == null) {
    throw new Error('Set JSON imports require a destination pack.');
  }

  if (file.scope === 'pack' && target.targetPackId != null) {
    throw new Error('Pack JSON cannot be imported from a set-level target.');
  }

  if (file.scope === 'library' && (target.targetPackId != null || target.currentPackName != null)) {
    throw new Error('Library JSON can only be imported at app level.');
  }
}

function validateImportRelationships(file: PortableImportFile): ImportWarning[] {
  const collections = getPortableCollections(file);
  const setIds = createPortableReferenceSet(collections.sets.map((set) => ({ sourceId: set.sourceId, portableId: set.portableId })));
  const sessionIds = createPortableReferenceSet(collections.sessions.map((session) => ({ sourceId: session.sourceId, portableId: session.portableId })));
  const cardIds = createPortableReferenceSet(collections.cards.map((card) => ({ sourceId: card.sourceId, portableId: card.portableId })));

  collections.sessions.forEach((session, index) => {
    if (!hasPortableReference(setIds, session.setSourceId, session.setPortableId)) {
      throw new Error(`Import file has an invalid session reference at data.sessions[${index}].`);
    }
  });

  collections.results.forEach((result, index) => {
    if (!hasPortableReference(sessionIds, result.sessionSourceId, result.sessionPortableId)) {
      throw new Error(`Import file has an invalid result session reference at data.results[${index}].`);
    }
  });

  collections.stats.forEach((stat, index) => {
    if (!hasPortableReference(cardIds, stat.cardSourceId, stat.cardPortableId)) {
      throw new Error(`Import file has an invalid stat card reference at data.stats[${index}].`);
    }
  });

  return collections.sessions.length > 0 && collections.results.length === 0
    ? [{ code: 'sessions-without-results', message: 'This file contains sessions without any results. They can be imported, but no stats will be rebuilt from them.' }]
    : [];
}

function setImportRuntimeMeta(file: PortableImportFile, meta: ImportFileRuntimeMeta): void {
  const current = getImportRuntimeMeta(file);
  (file as PortableImportFile & { [IMPORT_RUNTIME_META_KEY]?: ImportFileRuntimeMeta })[IMPORT_RUNTIME_META_KEY] = {
    warnings: dedupeWarnings([...current.warnings, ...meta.warnings]),
  };
}

function getImportRuntimeMeta(file: PortableImportFile): ImportFileRuntimeMeta {
  const meta = (file as PortableImportFile & { [IMPORT_RUNTIME_META_KEY]?: ImportFileRuntimeMeta })[IMPORT_RUNTIME_META_KEY];
  return meta ?? { warnings: [] };
}

function createPortableReferenceSet(entities: Array<{ sourceId: number; portableId?: string }>): Set<string> {
  const references = new Set<string>();

  for (const entity of entities) {
    references.add(toSourceKey(entity.sourceId));
    if (entity.portableId) {
      references.add(toPortableKey(entity.portableId));
    }
  }

  return references;
}

function hasPortableReference(references: Set<string>, sourceId: number, portableId?: string): boolean {
  if (portableId && references.has(toPortableKey(portableId))) {
    return true;
  }

  return references.has(toSourceKey(sourceId));
}

async function buildExportSupplementalData(
  setIds: number[],
  cards: Array<Pick<Card, 'id' | 'portableId' | 'question' | 'answer' | 'createdAt'>>,
  options: ExportOptions,
): Promise<{ stats: PortableStat[]; sessions: PortableSession[]; results: PortableResult[] }> {
  const stats = options.includeStats ? await exportStatsForCards(cards) : [];

  if (!options.includeSessions || setIds.length === 0) {
    return { stats, sessions: [], results: [] };
  }

  const [sets, sessions] = await Promise.all([
    db.sets.where('id').anyOf(setIds).toArray(),
    db.sessions.where('setId').anyOf(setIds).sortBy('startedAt'),
  ]);
  const sessionIds = sessions.flatMap((session) => (session.id == null ? [] : [session.id]));
  const results = sessionIds.length > 0
    ? await db.results.where('sessionId').anyOf(sessionIds).toArray()
    : [];

  return {
    stats,
    sessions: exportPortableSessions(sessions, sets),
    results: exportPortableResults(results, sessions, cards),
  };
}

async function exportStatsForCards(
  cards: Array<Pick<Card, 'id' | 'portableId' | 'question' | 'answer' | 'createdAt'>>,
): Promise<PortableStat[]> {
  const cardIds = cards.flatMap((card) => (card.id == null ? [] : [card.id]));
  if (cardIds.length === 0) {
    return [];
  }

  const [stats, localCards] = await Promise.all([
    db.stats.where('cardId').anyOf(cardIds).toArray(),
    db.cards.where('id').anyOf(cardIds).toArray(),
  ]);
  const cardsById = new Map(localCards.filter((card) => card.id != null).map((card) => [card.id!, card]));

  return stats.flatMap((stat) => {
    const card = cardsById.get(stat.cardId);
    if (!card || card.id == null) {
      return [];
    }

    return [{
      cardSourceId: card.id,
      cardPortableId: card.portableId,
      correctCount: stat.correctCount,
      incorrectCount: stat.incorrectCount,
      flaggedCount: stat.flaggedCount,
      lastResult: stat.lastResult,
      lastReviewedAt: stat.lastReviewedAt,
    }];
  });
}

function exportPortableSessions(sessions: Session[], sets: FlashSet[]): PortableSession[] {
  const setsById = new Map(sets.filter((set) => set.id != null).map((set) => [set.id!, set]));

  return sessions.flatMap((session) => {
    const set = setsById.get(session.setId);
    if (!set || session.id == null) {
      return [];
    }

    return [{
      sourceId: session.id,
      portableId: session.portableId,
      setSourceId: set.id!,
      setPortableId: set.portableId,
      startedAt: session.startedAt,
      completedAt: session.completedAt,
      score: session.score,
      mode: session.mode,
    }];
  });
}

function exportPortableResults(
  results: Result[],
  sessions: Session[],
  cards: Array<Pick<Card, 'id' | 'portableId' | 'question' | 'answer' | 'createdAt'>>,
): PortableResult[] {
  const sessionsById = new Map(sessions.filter((session) => session.id != null).map((session) => [session.id!, session]));
  const cardsById = new Map(cards.filter((card) => card.id != null).map((card) => [card.id!, card]));

  return results.flatMap((result) => {
    const session = sessionsById.get(result.sessionId);
    const card = cardsById.get(result.cardId);
    if (!session || !card || result.id == null) {
      return [];
    }

    return [{
      sourceId: result.id,
      sessionSourceId: session.id!,
      sessionPortableId: session.portableId,
      cardSourceId: card.id!,
      cardPortableId: card.portableId,
      outcome: result.outcome,
      timestamp: result.timestamp,
    }];
  });
}

function toSourceKey(sourceId: number): string {
  return `source:${sourceId}`;
}

function toPortableKey(portableId: string): string {
  return `portable:${portableId}`;
}

function toPortableImportFile(file: PortableSet | PortableImportFile): PortableImportFile {
  if ('data' in file) {
    return file;
  }

  return {
    app: APP_IDENTIFIER,
    version: SUPPORTED_VERSION,
    scope: 'set',
    exportedAt: Date.now(),
    includeStats: false,
    includeSessions: false,
    identityMode: file.portableId && file.cards.every((card) => Boolean(card.portableId)) ? 'portable' : 'heuristic',
    data: {
      set: file,
      stats: [],
      sessions: [],
      results: [],
    },
  };
}

function toFileStem(name: string): string {
  const stem = name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  return stem || 'set';
}

function getIdentityMode(entities: Array<{ portableId?: string }>): IdentityMode {
  return entities.every((entity) => Boolean(entity.portableId)) ? 'portable' : 'heuristic';
}

function groupCardsBySetId(
  cards: Array<Pick<Card, 'id' | 'portableId' | 'setId' | 'question' | 'answer' | 'createdAt'>>,
): Map<number, Array<Pick<Card, 'id' | 'portableId' | 'setId' | 'question' | 'answer' | 'createdAt'>>> {
  const cardsBySetId = new Map<number, Array<Pick<Card, 'id' | 'portableId' | 'setId' | 'question' | 'answer' | 'createdAt'>>>();

  for (const card of cards) {
    const existing = cardsBySetId.get(card.setId);
    if (existing) {
      existing.push(card);
    } else {
      cardsBySetId.set(card.setId, [card]);
    }
  }

  return cardsBySetId;
}

function createPreviewFromState(
  importFile: PortableImportFile,
  target: ImportPreviewTarget,
  existingState: ImportState,
): ImportPreview {
  const counts = countImportEntities(importFile);
  const copyPlan = createAnalysisPlan(importFile, 'copy', target.targetPackId, target, existingState);
  const mergePlan = createAnalysisPlan(importFile, 'merge', target.targetPackId, target, existingState);
  const replacePlan = createAnalysisPlan(importFile, 'replace', target.targetPackId, target, existingState);
  const copyAnalysis = analyzeImportPlan(copyPlan);
  const mergeAnalysis = analyzeImportPlan(mergePlan);
  const replaceAnalysis = analyzeImportPlan(replacePlan);
  const conflicts = dedupeConflicts([
    ...(detectImportConflicts(mergePlan) as RuntimeImportConflict[]),
    ...(detectImportConflicts(replacePlan) as RuntimeImportConflict[]),
  ]);
  const preview: RuntimeImportPreviewWithMeta = {
    scope: importFile.scope,
    target: resolvePreviewTargetLabel(importFile, target, existingState),
    version: importFile.version,
    identityMode: importFile.identityMode,
    mode: 'copy',
    includeStats: importFile.includeSessions ? true : importFile.includeStats,
    includeSessions: importFile.includeSessions,
    counts: {
      packs: counts.packs,
      sets: counts.sets,
      cards: counts.cards,
      stats: counts.stats,
      sessions: counts.sessions,
      results: counts.results,
    },
    duplicates: mergeAnalysis.duplicates,
    conflicts,
    warnings: dedupeWarnings([
      ...getImportRuntimeMeta(importFile).warnings,
      ...copyAnalysis.warnings,
      ...mergeAnalysis.warnings,
      ...replaceAnalysis.warnings,
    ]),
    affectedActiveSessions: dedupeAffectedActiveSessions([
      ...mergeAnalysis.affectedActiveSessions,
      ...replaceAnalysis.affectedActiveSessions,
    ]),
    plannedCreates: mergeAnalysis.plannedCreates,
    plannedMerges: mergeAnalysis.plannedMerges,
    plannedReplacements: replaceAnalysis.plannedReplacements,
    sourceFile: importFile,
    fileContainsStats: counts.stats > 0,
    fileContainsSessions: counts.sessions > 0 || counts.results > 0,
    supplementalByMode: {
      copy: copyAnalysis.supplementalSummary,
      merge: mergeAnalysis.supplementalSummary,
      replace: replaceAnalysis.supplementalSummary,
    },
  };

  return preview as unknown as ImportPreview;
}

function createAnalysisPlan(
  file: PortableImportFile,
  mode: ImportMode,
  targetPackId: number | undefined,
  target: ImportPreviewTarget | undefined,
  existingState: ImportState,
): AnalysisPlan {
  return {
    mode,
    creates: 0,
    merges: 0,
    replacements: 0,
    skipped: 0,
    warnings: [],
    conflicts: [],
    file,
    targetPackId,
    target,
    existingState,
  };
}

function analyzeImportPlan(plan: AnalysisPlan): ImportAnalysis {
  const analysis = (() => {
    switch (plan.file.scope) {
      case 'set':
        return analyzeSetImport(plan);
      case 'pack':
        return analyzePackImport(plan);
      case 'library':
        return analyzeLibraryImport(plan);
    }
  })();

  return finalizeAnalysisWithSupplementalSummary(plan, analysis);
}

function analyzeSetImport(plan: AnalysisPlan): ImportAnalysis {
  const portableSet = getPortableSetPayload(plan.file).set;
  const baseAnalysis = createEmptyAnalysis();

  if (plan.targetPackId == null) {
    throw new Error('Set imports require a target pack.');
  }

  const targetPack = plan.existingState.packs.find((pack) => pack.id === plan.targetPackId);
  if (!targetPack) {
    throw new Error('Target pack was not found.');
  }

  if (plan.mode === 'copy') {
    const hasSameTitle = (plan.existingState.setsByPackAndNormalisedTitle.get(plan.targetPackId)?.get(normaliseNameOrTitle(portableSet.title)) ?? []).length > 0;
    return {
      ...baseAnalysis,
      warnings: hasSameTitle
        ? [{ code: 'set-name-collision', message: `A set named "${portableSet.title}" already exists in ${targetPack.name}. Copy mode will create another set.` }]
        : [],
      plannedCreates: 1 + portableSet.cards.length,
    };
  }

  if (plan.mode === 'replace') {
    const setMatch = resolveSetMatch(portableSet, plan.targetPackId, plan.existingState);
    return {
      ...baseAnalysis,
      affectedActiveSessions: setMatch.entity ? getAffectedActiveSessionsForSet(setMatch.entity, plan.existingState) : [],
      matchedRootSet: setMatch.entity,
      plannedCreates: setMatch.entity ? 0 : 1 + portableSet.cards.length,
      plannedReplacements: setMatch.entity ? 1 : 0,
    };
  }

  return analyzePortableSetMerge(portableSet, plan.targetPackId, plan.file.identityMode, plan.existingState);
}

function analyzePackImport(plan: AnalysisPlan): ImportAnalysis {
  const portablePack = getPortablePackPayload(plan.file).pack;
  const counts = countPortablePackEntities(portablePack);
  const baseAnalysis = createEmptyAnalysis();

  if (plan.mode === 'copy') {
    const warnings: ImportWarning[] = [];
    const sameNameCount = plan.existingState.packsByNormalisedName.get(normaliseNameOrTitle(portablePack.name))?.length ?? 0;

    if (sameNameCount > 0) {
      warnings.push({
        code: 'pack-name-collision',
        message: `A pack named "${portablePack.name}" already exists. Copy mode will create another pack.`,
      });
    }

    if (plan.target?.currentPackName) {
      warnings.unshift({
        code: 'pack-import-separate',
        message: `Importing this pack here creates a new separate pack. It will not merge into "${plan.target.currentPackName}" in Copy mode.`,
      });
    }

    return {
      ...baseAnalysis,
      warnings,
      plannedCreates: counts.packs + counts.sets + counts.cards,
    };
  }

  if (plan.mode === 'replace') {
    const packMatch = resolvePackMatch(portablePack, plan.existingState);
    const conflicts = packMatch.ambiguousMatches && packMatch.ambiguousMatches.length > 1
      ? [createConflict({
          entity: 'pack',
          code: 'pack-heuristic-replace-ambiguous',
          message: `Replace cannot continue because more than one destination pack matches "${portablePack.name}" by name. Choose Copy or provide portable IDs instead.`,
          portableId: portablePack.portableId,
          sourceId: portablePack.sourceId,
          blocking: true,
          appliesTo: ['replace'],
          matchedBy: 'heuristic',
        })]
      : [];

    return {
      ...baseAnalysis,
      conflicts,
      affectedActiveSessions: packMatch.entity ? getAffectedActiveSessionsForPack(packMatch.entity.id!, plan.existingState) : [],
      matchedRootPack: packMatch.entity,
      plannedCreates: packMatch.entity ? 0 : counts.packs + counts.sets + counts.cards,
      plannedReplacements: packMatch.entity ? 1 : 0,
    };
  }

  return analyzePortablePackMerge(portablePack, plan.file.identityMode, plan.existingState, counts);
}

function analyzeLibraryImport(plan: AnalysisPlan): ImportAnalysis {
  const portableLibrary = getPortableLibraryPayload(plan.file);
  const counts = countPortableLibraryEntities(portableLibrary);

  if (plan.mode === 'replace') {
    return createEmptyAnalysis();
  }

  if (plan.mode === 'copy') {
    const existingNames = new Set(plan.existingState.packs.map((pack) => normaliseNameOrTitle(pack.name)));
    const warnings = portableLibrary.packs
      .filter((pack) => existingNames.has(normaliseNameOrTitle(pack.name)))
      .map<ImportWarning>((pack) => ({
        code: 'library-pack-name-collision',
        message: `A pack named "${pack.name}" already exists. Copy mode will create another pack.`,
      }));

    if (plan.existingState.packs.length > 0) {
      warnings.unshift({
        code: 'library-copy-additive',
        message: 'Copy mode preserves your existing library and adds the imported packs alongside it.',
      });
    }

    return {
      ...createEmptyAnalysis(),
      warnings,
      plannedCreates: counts.packs + counts.sets + counts.cards,
    };
  }

  let analysis = createEmptyAnalysis();
  for (const portablePack of portableLibrary.packs) {
    analysis = mergeAnalyses(
      analysis,
      analyzePortablePackMerge(portablePack, plan.file.identityMode, plan.existingState),
    );
  }

  return analysis;
}

function analyzePortablePackMerge(
  portablePack: PortablePack,
  identityMode: IdentityMode,
  existingState: ImportState,
  counts = countPortablePackEntities(portablePack),
): ImportAnalysis {
  const baseAnalysis = createEmptyAnalysis();
  const packMatch = resolvePackMatch(portablePack, existingState);

  if (!packMatch.entity || (packMatch.ambiguousMatches && packMatch.ambiguousMatches.length > 1)) {
    return {
      ...baseAnalysis,
      plannedCreates: counts.packs + counts.sets + counts.cards,
    };
  }

  let analysis: ImportAnalysis = {
    ...baseAnalysis,
    matchedRootPack: packMatch.entity,
    plannedMerges: 1,
  };

  if (packMatch.entity.color !== portablePack.color) {
    analysis.conflicts.push(createConflict({
      entity: 'pack',
      code: 'pack-color-conflict',
      message: `Pack "${portablePack.name}" matches an existing pack but has a different colour. Merge will keep the existing colour.`,
      portableId: portablePack.portableId,
      sourceId: portablePack.sourceId,
      appliesTo: ['merge'],
      matchedBy: toHeuristicFlag(identityMode, packMatch.matchedBy),
    }));
  }

  for (const portableSet of portablePack.sets) {
    analysis = mergeAnalyses(
      analysis,
      analyzePortableSetMerge(portableSet, packMatch.entity.id!, identityMode, existingState),
    );
  }

  return analysis;
}

function analyzePortableSetMerge(
  portableSet: PortableSet,
  packId: number,
  identityMode: IdentityMode,
  existingState: ImportState,
): ImportAnalysis {
  const baseAnalysis = createEmptyAnalysis();
  const setMatch = resolveSetMatch(portableSet, packId, existingState);

  if (!setMatch.entity) {
    return {
      ...baseAnalysis,
      plannedCreates: 1 + portableSet.cards.length,
    };
  }

  const existingSet = setMatch.entity;
  const existingCards = existingState.cardsBySetId.get(existingSet.id!) ?? [];
  const analysis: ImportAnalysis = {
    ...baseAnalysis,
    matchedRootSet: existingSet,
    affectedActiveSessions: getAffectedActiveSessionsForSet(existingSet, existingState),
    plannedMerges: 1,
  };

  if (hasSetDescriptionConflict(existingSet, portableSet)) {
    analysis.conflicts.push(createConflict({
      entity: 'set',
      code: 'set-description-conflict',
      message: `Set "${portableSet.title}" matches an existing set but has a different description. Merge will keep the existing description.`,
      portableId: portableSet.portableId,
      sourceId: portableSet.sourceId,
      appliesTo: ['merge'],
      matchedBy: toHeuristicFlag(identityMode, setMatch.matchedBy),
    }));
  }

  for (const portableCard of portableSet.cards) {
    const cardMatch = resolveCardMatch(portableCard, existingCards);

    switch (cardMatch.outcome) {
      case 'create':
        analysis.plannedCreates += 1;
        break;
      case 'duplicate':
        analysis.duplicates += 1;
        break;
      case 'conflict':
        analysis.conflicts.push(createConflict({
          entity: 'card',
          code: cardMatch.reason,
          message: cardMatch.reason === 'portableId-changed-content'
            ? `Card "${truncateLabel(portableCard.question)}" matches an existing card by portable ID, but its content has changed.`
            : `Card question "${truncateLabel(portableCard.question)}" already exists with a different answer. Merge will keep the existing card and add the imported one as new.`,
          portableId: portableCard.portableId,
          sourceId: portableCard.sourceId,
          appliesTo: ['merge'],
          matchedBy: toHeuristicFlag(identityMode, cardMatch.matchedBy),
        }));
        if (cardMatch.reason === 'portableId-changed-content') {
          analysis.plannedMerges += 1;
        } else {
          analysis.plannedCreates += 1;
        }
        break;
    }
  }

  return analysis;
}

function resolvePackMatch(portablePack: PortablePack, existingState: ImportState): EntityMatch<Pack> {
  if (portablePack.portableId) {
    const byPortableId = existingState.packsByPortableId.get(portablePack.portableId);
    if (byPortableId) {
      return { entity: byPortableId, matchedBy: 'portableId' };
    }
  }

  const byName = existingState.packsByNormalisedName.get(normaliseNameOrTitle(portablePack.name)) ?? [];
  if (byName.length === 1) {
    return { entity: byName[0], matchedBy: 'heuristic' };
  }

  if (byName.length > 1) {
    return { ambiguousMatches: byName };
  }

  return {};
}

function resolveSetMatch(portableSet: PortableSet, packId: number, existingState: ImportState): EntityMatch<FlashSet> {
  if (portableSet.portableId) {
    const byPortableId = existingState.setsByPortableId.get(portableSet.portableId);
    if (byPortableId && byPortableId.packId === packId) {
      return { entity: byPortableId, matchedBy: 'portableId' };
    }
  }

  const byTitle = existingState.setsByPackAndNormalisedTitle.get(packId)?.get(normaliseNameOrTitle(portableSet.title)) ?? [];
  if (byTitle.length > 0) {
    return { entity: byTitle[0], matchedBy: 'heuristic' };
  }

  return {};
}

function resolveCardMatch(portableCard: PortableCard, existingCards: Card[]): CardMatchResult {
  if (portableCard.portableId) {
    const byPortableId = existingCards.find((card) => card.portableId === portableCard.portableId);
    if (byPortableId) {
      return isExactCardDuplicate(byPortableId, portableCard)
        ? { outcome: 'duplicate', existingCard: byPortableId, matchedBy: 'portableId' }
        : {
            outcome: 'conflict',
            existingCard: byPortableId,
            matchedBy: 'portableId',
            reason: 'portableId-changed-content',
          };
    }
  }

  const sameQuestionCards = existingCards.filter((card) => normaliseCardText(card.question) === normaliseCardText(portableCard.question));
  const exactDuplicate = sameQuestionCards.find((card) => normaliseCardText(card.answer) === normaliseCardText(portableCard.answer));

  if (exactDuplicate) {
    return { outcome: 'duplicate', existingCard: exactDuplicate, matchedBy: 'heuristic' };
  }

  if (sameQuestionCards.length > 0) {
    return {
      outcome: 'conflict',
      existingCard: sameQuestionCards[0],
      matchedBy: 'heuristic',
      reason: 'same-question-different-answer',
    };
  }

  return { outcome: 'create' };
}

async function loadImportState(): Promise<ImportState> {
  const [packs, sets, cards, sessions, activeSessions] = await Promise.all([
    db.packs.toArray(),
    db.sets.toArray(),
    db.cards.toArray(),
    db.sessions.toArray(),
    db.activeSessions.toArray(),
  ]);

  const packsByPortableId = new Map<string, Pack>();
  const packsByNormalisedName = new Map<string, Pack[]>();
  for (const pack of packs) {
    if (pack.portableId) {
      packsByPortableId.set(pack.portableId, pack);
    }
    const key = normaliseNameOrTitle(pack.name);
    const existing = packsByNormalisedName.get(key);
    if (existing) {
      existing.push(pack);
    } else {
      packsByNormalisedName.set(key, [pack]);
    }
  }

  const setsByPortableId = new Map<string, FlashSet>();
  const setsByPackId = new Map<number, FlashSet[]>();
  const setsByPackAndNormalisedTitle = new Map<number, Map<string, FlashSet[]>>();
  for (const set of sets) {
    if (set.portableId) {
      setsByPortableId.set(set.portableId, set);
    }

    const byPack = setsByPackId.get(set.packId);
    if (byPack) {
      byPack.push(set);
    } else {
      setsByPackId.set(set.packId, [set]);
    }

    const titlesByPack = setsByPackAndNormalisedTitle.get(set.packId) ?? new Map<string, FlashSet[]>();
    const titleKey = normaliseNameOrTitle(set.title);
    const byTitle = titlesByPack.get(titleKey);
    if (byTitle) {
      byTitle.push(set);
    } else {
      titlesByPack.set(titleKey, [set]);
    }
    setsByPackAndNormalisedTitle.set(set.packId, titlesByPack);
  }

  const cardsByPortableId = new Map<string, Card>();
  const cardsBySetId = new Map<number, Card[]>();
  for (const card of cards) {
    if (card.portableId) {
      cardsByPortableId.set(card.portableId, card);
    }
    const existing = cardsBySetId.get(card.setId);
    if (existing) {
      existing.push(card);
    } else {
      cardsBySetId.set(card.setId, [card]);
    }
  }

  const sessionsByPortableId = new Map<string, Session>();
  for (const session of sessions) {
    if (session.portableId) {
      sessionsByPortableId.set(session.portableId, session);
    }
  }

  const activeSessionsBySetId = new Map<number, ActiveSession>();
  for (const activeSession of activeSessions) {
    activeSessionsBySetId.set(activeSession.setId, activeSession);
  }

  return {
    packs,
    sets,
    cards,
    sessions,
    activeSessions,
    packsByPortableId,
    packsByNormalisedName,
    setsByPortableId,
    setsByPackId,
    setsByPackAndNormalisedTitle,
    cardsByPortableId,
    cardsBySetId,
    sessionsByPortableId,
    activeSessionsBySetId,
  };
}

function countImportEntities(importFile: PortableImportFile): { packs: number; sets: number; cards: number; stats: number; sessions: number; results: number } {
  const collections = getPortableCollections(importFile);

  return {
    packs: collections.packs.length,
    sets: collections.sets.length,
    cards: collections.cards.length,
    stats: collections.stats.length,
    sessions: collections.sessions.length,
    results: collections.results.length,
  };
}

function countPortablePackEntities(portablePack: PortablePack): { packs: number; sets: number; cards: number } {
  return {
    packs: 1,
    sets: portablePack.sets.length,
    cards: portablePack.sets.reduce((total, set) => total + set.cards.length, 0),
  };
}

function countPortableLibraryEntities(portableLibrary: PortableLibrary): { packs: number; sets: number; cards: number } {
  return {
    packs: portableLibrary.packs.length,
    sets: portableLibrary.packs.reduce((total, pack) => total + pack.sets.length, 0),
    cards: portableLibrary.packs.reduce(
      (total, pack) => total + pack.sets.reduce((setTotal, set) => setTotal + set.cards.length, 0),
      0,
    ),
  };
}

function createEmptySupplementalSummary(): SupplementalImportSummary {
  return {
    statsToImport: 0,
    recomputedStatsCount: 0,
    sessionsToImport: 0,
    resultsToImport: 0,
    duplicateSessions: 0,
    skippedResults: 0,
    warnings: [],
  };
}

function mergeSupplementalSummaries(base: SupplementalImportSummary, extra: SupplementalImportSummary): SupplementalImportSummary {
  return {
    statsToImport: base.statsToImport + extra.statsToImport,
    recomputedStatsCount: base.recomputedStatsCount + extra.recomputedStatsCount,
    sessionsToImport: base.sessionsToImport + extra.sessionsToImport,
    resultsToImport: base.resultsToImport + extra.resultsToImport,
    duplicateSessions: base.duplicateSessions + extra.duplicateSessions,
    skippedResults: base.skippedResults + extra.skippedResults,
    warnings: dedupeWarnings([...base.warnings, ...extra.warnings]),
  };
}

function finalizeAnalysisWithSupplementalSummary(plan: AnalysisPlan, analysis: ImportAnalysis): ImportAnalysis {
  if (plan.file.scope === 'library' && plan.mode === 'replace') {
    return analysis;
  }

  const supplementalSummary = summarizeSupplementalImport(plan, buildPreviewResolution(plan));
  return {
    ...analysis,
    warnings: dedupeWarnings([...analysis.warnings, ...supplementalSummary.warnings]),
    supplementalSummary,
  };
}

function buildPreviewResolution(plan: AnalysisPlan): Pick<ImportExecutionContext, 'setIds' | 'cardTargets'> {
  const resolution = {
    setIds: new Map<string, number>(),
    cardTargets: new Map<string, ImportedCardTarget>(),
    nextPreviewId: -1,
  };

  switch (plan.file.scope) {
    case 'set':
      simulatePreviewSetResolution(getPortableSetPayload(plan.file).set, plan, resolution, plan.targetPackId);
      break;
    case 'pack':
      simulatePreviewPackResolution(getPortablePackPayload(plan.file).pack, plan, resolution);
      break;
    case 'library':
      for (const portablePack of getPortableLibraryPayload(plan.file).packs) {
        simulatePreviewPackResolution(portablePack, plan, resolution);
      }
      break;
  }

  return {
    setIds: resolution.setIds,
    cardTargets: resolution.cardTargets,
  };
}

function simulatePreviewPackResolution(
  portablePack: PortablePack,
  plan: AnalysisPlan,
  resolution: { setIds: Map<string, number>; cardTargets: Map<string, ImportedCardTarget>; nextPreviewId: number },
): void {
  const shouldMerge = plan.mode === 'merge';
  const packMatch = shouldMerge ? resolvePackMatch(portablePack, plan.existingState) : {};
  const matchedPack = packMatch.entity && (!packMatch.ambiguousMatches || packMatch.ambiguousMatches.length <= 1)
    ? packMatch.entity
    : undefined;

  for (const portableSet of portablePack.sets) {
    simulatePreviewSetResolution(portableSet, plan, resolution, matchedPack?.id);
  }
}

function simulatePreviewSetResolution(
  portableSet: PortableSet,
  plan: AnalysisPlan,
  resolution: { setIds: Map<string, number>; cardTargets: Map<string, ImportedCardTarget>; nextPreviewId: number },
  packIdOrNew: number | true | undefined,
): void {
  if (packIdOrNew === true || plan.mode === 'copy' || plan.mode === 'replace') {
    registerPreviewCreatedSet(portableSet, resolution);
    return;
  }

  const packId = packIdOrNew ?? plan.targetPackId;
  if (packId == null) {
    registerPreviewCreatedSet(portableSet, resolution);
    return;
  }

  const setMatch = resolveSetMatch(portableSet, packId, plan.existingState);
  if (!setMatch.entity) {
    registerPreviewCreatedSet(portableSet, resolution);
    return;
  }

  registerEntityId(resolution.setIds, portableSet.sourceId, portableSet.portableId, setMatch.entity.id!);
  const existingCards = plan.existingState.cardsBySetId.get(setMatch.entity.id!) ?? [];

  for (const portableCard of portableSet.cards) {
    const cardMatch = resolveCardMatch(portableCard, existingCards);

    if (cardMatch.outcome === 'create' || (cardMatch.outcome === 'conflict' && cardMatch.reason === 'same-question-different-answer')) {
      registerCardTarget(resolution.cardTargets, portableCard, { localId: allocatePreviewId(resolution), created: true });
      continue;
    }

    const existingCard = cardMatch.existingCard;
    registerCardTarget(resolution.cardTargets, portableCard, { localId: existingCard.id!, created: false });
  }
}

function registerPreviewCreatedSet(
  portableSet: PortableSet,
  resolution: { setIds: Map<string, number>; cardTargets: Map<string, ImportedCardTarget>; nextPreviewId: number },
): void {
  registerEntityId(resolution.setIds, portableSet.sourceId, portableSet.portableId, allocatePreviewId(resolution));

  for (const portableCard of portableSet.cards) {
    registerCardTarget(resolution.cardTargets, portableCard, { localId: allocatePreviewId(resolution), created: true });
  }
}

function allocatePreviewId(resolution: { nextPreviewId: number }): number {
  const nextId = resolution.nextPreviewId;
  resolution.nextPreviewId -= 1;
  return nextId;
}

function summarizeSupplementalImport(
  plan: AnalysisPlan,
  resolution: Pick<ImportExecutionContext, 'setIds' | 'cardTargets'>,
): SupplementalImportSummary {
  const collections = getPortableCollections(plan.file);
  const summary = createEmptySupplementalSummary();

  if (collections.stats.length > 0) {
    for (const stat of collections.stats) {
      const cardTarget = resolveCardTarget(resolution.cardTargets, stat.cardSourceId, stat.cardPortableId);
      if (!cardTarget) {
        continue;
      }

      if (plan.mode === 'merge' && !cardTarget.created) {
        continue;
      }

      summary.statsToImport += 1;
    }
  }

  if (collections.sessions.length === 0) {
    return summary;
  }

  const sessionIds = new Map<string, number>();
  let nextSessionId = -1000000;
  const importableResults: PortableResult[] = [];

  for (const session of collections.sessions) {
    const setId = resolveMappedId(resolution.setIds, session.setSourceId, session.setPortableId);
    if (setId == null) {
      continue;
    }

    if (plan.mode === 'merge' && session.portableId && plan.existingState.sessionsByPortableId.has(session.portableId)) {
      summary.duplicateSessions += 1;
      continue;
    }

    summary.sessionsToImport += 1;
    registerEntityId(sessionIds, session.sourceId, session.portableId, nextSessionId);
    nextSessionId -= 1;
  }

  for (const result of collections.results) {
    if (resolveMappedId(sessionIds, result.sessionSourceId, result.sessionPortableId) == null) {
      continue;
    }

    if (!resolveCardTarget(resolution.cardTargets, result.cardSourceId, result.cardPortableId)) {
      summary.skippedResults += 1;
      continue;
    }

    summary.resultsToImport += 1;
    importableResults.push(result);
  }

  summary.recomputedStatsCount = recomputeStatsFromResults(importableResults, projectCardIdMap(resolution.cardTargets)).length;

  if (summary.skippedResults > 0) {
    summary.warnings.push({
      code: 'results-skipped-missing-card',
      message: `${summary.skippedResults} result${summary.skippedResults !== 1 ? 's' : ''} reference card${summary.skippedResults !== 1 ? 's' : ''} that cannot be resolved after import and will be skipped.`,
    });
  }

  return summary;
}

function projectCardIdMap(cardTargets: Map<string, ImportedCardTarget>): Map<string, number> {
  const cardIds = new Map<string, number>();
  for (const [key, target] of cardTargets.entries()) {
    cardIds.set(key, target.localId);
  }
  return cardIds;
}

function registerEntityId(map: Map<string, number>, sourceId: number, portableId: string | undefined, localId: number): void {
  map.set(toSourceKey(sourceId), localId);
  if (portableId) {
    map.set(toPortableKey(portableId), localId);
  }
}

function resolveMappedId(map: Map<string, number>, sourceId: number, portableId?: string): number | undefined {
  if (portableId) {
    const byPortableId = map.get(toPortableKey(portableId));
    if (byPortableId != null) {
      return byPortableId;
    }
  }

  return map.get(toSourceKey(sourceId));
}

function registerCardTarget(
  map: Map<string, ImportedCardTarget>,
  portableCard: Pick<PortableCard, 'sourceId' | 'portableId'>,
  target: ImportedCardTarget,
): void {
  map.set(toSourceKey(portableCard.sourceId), target);
  if (portableCard.portableId) {
    map.set(toPortableKey(portableCard.portableId), target);
  }
}

function resolveCardTarget(
  map: Map<string, ImportedCardTarget>,
  cardSourceId: number,
  cardPortableId?: string,
): ImportedCardTarget | undefined {
  if (cardPortableId) {
    const byPortableId = map.get(toPortableKey(cardPortableId));
    if (byPortableId) {
      return byPortableId;
    }
  }

  return map.get(toSourceKey(cardSourceId));
}

export function recomputeStatsFromResults(
  results: PortableResult[],
  cardIdMap: Map<string, number>,
): Omit<Stat, 'id'>[] {
  const statsByCardId = new Map<number, Omit<Stat, 'id'>>();

  for (const result of results) {
    const cardId = resolveMappedId(cardIdMap, result.cardSourceId, result.cardPortableId);
    if (cardId == null) {
      continue;
    }

    const existing = statsByCardId.get(cardId) ?? {
      cardId,
      correctCount: 0,
      incorrectCount: 0,
      flaggedCount: 0,
      lastResult: undefined,
      lastReviewedAt: undefined,
    };

    if (result.outcome === 'correct') {
      existing.correctCount += 1;
    } else if (result.outcome === 'incorrect') {
      existing.incorrectCount += 1;
    } else {
      existing.flaggedCount += 1;
    }

    if (existing.lastReviewedAt == null || result.timestamp >= existing.lastReviewedAt) {
      existing.lastReviewedAt = result.timestamp;
      existing.lastResult = result.outcome;
    }

    statsByCardId.set(cardId, existing);
  }

  return [...statsByCardId.values()];
}

function resolvePreviewTargetLabel(importFile: PortableImportFile, target: ImportPreviewTarget, existingState: ImportState): string {
  if (importFile.scope === 'set') {
    if (target.targetPackId == null) {
      throw new Error('Set imports require a target pack.');
    }

    const targetPack = existingState.packs.find((pack) => pack.id === target.targetPackId);
    if (!targetPack) {
      throw new Error('Target pack was not found.');
    }

    return targetPack.name;
  }

  return target.targetLabel ?? 'Entire library';
}

function createEmptyAnalysis(): ImportAnalysis {
  return {
    duplicates: 0,
    conflicts: [],
    warnings: [],
    affectedActiveSessions: [],
    plannedCreates: 0,
    plannedMerges: 0,
    plannedReplacements: 0,
    supplementalSummary: createEmptySupplementalSummary(),
  };
}

function mergeAnalyses(base: ImportAnalysis, extra: ImportAnalysis): ImportAnalysis {
  return {
    duplicates: base.duplicates + extra.duplicates,
    conflicts: dedupeConflicts([...base.conflicts, ...extra.conflicts]),
    warnings: dedupeWarnings([...base.warnings, ...extra.warnings]),
    affectedActiveSessions: dedupeAffectedActiveSessions([...base.affectedActiveSessions, ...extra.affectedActiveSessions]),
    plannedCreates: base.plannedCreates + extra.plannedCreates,
    plannedMerges: base.plannedMerges + extra.plannedMerges,
    plannedReplacements: base.plannedReplacements + extra.plannedReplacements,
    supplementalSummary: mergeSupplementalSummaries(base.supplementalSummary, extra.supplementalSummary),
    matchedRootPack: base.matchedRootPack ?? extra.matchedRootPack,
    matchedRootSet: base.matchedRootSet ?? extra.matchedRootSet,
  };
}

function dedupeConflicts(conflicts: RuntimeImportConflict[]): RuntimeImportConflict[] {
  const seen = new Set<string>();
  return conflicts.filter((conflict) => {
    const key = [conflict.code, conflict.message, conflict.entity, conflict.sourceId ?? '', conflict.portableId ?? '', conflict.matchedBy ?? ''].join('|');
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function dedupeWarnings(warnings: ImportWarning[]): ImportWarning[] {
  const seen = new Set<string>();
  return warnings.filter((warning) => {
    const key = `${warning.code}|${warning.message}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function dedupeAffectedActiveSessions(sessions: AffectedActiveSession[]): AffectedActiveSession[] {
  const seen = new Set<number>();
  return sessions.filter((session) => {
    if (seen.has(session.setId)) {
      return false;
    }
    seen.add(session.setId);
    return true;
  });
}

function getAffectedActiveSessionsForSet(set: FlashSet, existingState: ImportState): AffectedActiveSession[] {
  if (!existingState.activeSessionsBySetId.has(set.id!)) {
    return [];
  }

  const packName = existingState.packs.find((pack) => pack.id === set.packId)?.name;
  return [{ setId: set.id!, title: set.title, packName }];
}

function getAffectedActiveSessionsForPack(packId: number, existingState: ImportState): AffectedActiveSession[] {
  return (existingState.setsByPackId.get(packId) ?? [])
    .filter((set) => existingState.activeSessionsBySetId.has(set.id!))
    .map((set) => ({ setId: set.id!, title: set.title, packName: existingState.packs.find((pack) => pack.id === packId)?.name }));
}

function hasSetDescriptionConflict(existingSet: FlashSet, portableSet: PortableSet): boolean {
  const existingDescription = existingSet.description?.trim() ?? '';
  const importedDescription = portableSet.description?.trim() ?? '';
  return existingDescription !== '' && importedDescription !== '' && existingDescription !== importedDescription;
}

function isExactCardDuplicate(existingCard: Card, portableCard: PortableCard): boolean {
  return normaliseCardText(existingCard.question) === normaliseCardText(portableCard.question)
    && normaliseCardText(existingCard.answer) === normaliseCardText(portableCard.answer);
}

function normaliseNameOrTitle(value: string): string {
  return value.trim().toLowerCase();
}

function toHeuristicFlag(identityMode: IdentityMode, matchedBy: MatchMethod | undefined): 'heuristic' | undefined {
  return identityMode === 'heuristic' && matchedBy === 'heuristic' ? 'heuristic' : undefined;
}

function createConflict(conflict: RuntimeImportConflict): RuntimeImportConflict {
  return conflict;
}

function truncateLabel(value: string): string {
  return value.length > 60 ? `${value.slice(0, 57)}...` : value;
}

function getBlockingConflictForMode(
  conflicts: RuntimeImportConflict[],
  mode: ImportMode,
): RuntimeImportConflict | undefined {
  return conflicts.find((conflict) => conflict.blocking && appliesToMode(conflict, mode));
}

function appliesToMode(conflict: RuntimeImportConflict, mode: ImportMode): boolean {
  return !conflict.appliesTo || conflict.appliesTo.includes(mode);
}

async function executeCopyImport(importPlan: SetImportPlan, existingState: ImportState): Promise<ImportExecutionContext> {
  const preservePortableIds = importPlan.file.identityMode === 'portable';
  const context = createImportExecutionContext(existingState);

  switch (importPlan.file.scope) {
    case 'set': {
      const targetPack = await requireTargetPack(importPlan.targetPackId);
      await insertPortableSet(getPortableSetPayload(importPlan.file).set, targetPack.id!, preservePortableIds, context);
      break;
    }
    case 'pack':
      await insertPortablePack(getPortablePackPayload(importPlan.file).pack, preservePortableIds, context);
      break;
    case 'library': {
      for (const portablePack of getPortableLibraryPayload(importPlan.file).packs) {
        await insertPortablePack(portablePack, preservePortableIds, context);
      }
      break;
    }
  }

  return context;
}

async function executeMergeImport(importPlan: SetImportPlan, existingState: ImportState): Promise<ImportExecutionContext> {
  const preservePortableIds = importPlan.file.identityMode === 'portable';
  const context = createImportExecutionContext(existingState);

  switch (importPlan.file.scope) {
    case 'set': {
      const targetPack = await requireTargetPack(importPlan.targetPackId);
      await mergePortableSetIntoPack(
        getPortableSetPayload(importPlan.file).set,
        targetPack.id!,
        preservePortableIds,
        importPlan.file.identityMode,
        context,
      );
      break;
    }
    case 'pack':
      await mergePortablePack(getPortablePackPayload(importPlan.file).pack, preservePortableIds, importPlan.file.identityMode, context);
      break;
    case 'library':
      for (const portablePack of getPortableLibraryPayload(importPlan.file).packs) {
        await mergePortablePack(portablePack, preservePortableIds, importPlan.file.identityMode, context);
      }
      break;
  }

  return context;
}

async function executeReplaceImport(
  importPlan: SetImportPlan,
  existingState: ImportState,
  analysis: ImportAnalysis,
): Promise<ImportExecutionContext> {
  if (importPlan.file.scope === 'library') {
    throw new Error('Library Replace is not supported.');
  }

  const preservePortableIds = importPlan.file.identityMode === 'portable';
  let liveState = existingState;

  switch (importPlan.file.scope) {
    case 'set': {
      const targetPack = await requireTargetPack(importPlan.targetPackId);
      if (analysis.matchedRootSet?.id != null) {
        await deleteSetCascade(analysis.matchedRootSet.id);
        liveState = await loadImportState();
      }
      const context = createImportExecutionContext(liveState);
      await insertPortableSet(getPortableSetPayload(importPlan.file).set, targetPack.id!, preservePortableIds, context);
      await clearAffectedActiveSessions(analysis.affectedActiveSessions);
      return context;
    }
    case 'pack': {
      if (analysis.matchedRootPack?.id != null) {
        await deletePackCascade(analysis.matchedRootPack.id);
        liveState = await loadImportState();
      }
      const context = createImportExecutionContext(liveState);
      await insertPortablePack(getPortablePackPayload(importPlan.file).pack, preservePortableIds, context);
      await clearAffectedActiveSessions(analysis.affectedActiveSessions);
      return context;
    }
  }

  throw new Error('Unsupported replace import scope.');
}

async function mergePortablePack(
  portablePack: PortablePack,
  preservePortableIds: boolean,
  identityMode: IdentityMode,
  context: ImportExecutionContext,
): Promise<number> {
  const existingState = context.existingState;
  const packMatch = resolvePackMatch(portablePack, existingState);

  if (!packMatch.entity || (packMatch.ambiguousMatches && packMatch.ambiguousMatches.length > 1)) {
    return insertPortablePack(portablePack, preservePortableIds, context);
  }

  for (const portableSet of portablePack.sets) {
    await mergePortableSetIntoPack(portableSet, packMatch.entity.id!, preservePortableIds, identityMode, context);
  }

  return packMatch.entity.id!;
}

async function mergePortableSetIntoPack(
  portableSet: PortableSet,
  packId: number,
  preservePortableIds: boolean,
  identityMode: IdentityMode,
  context: ImportExecutionContext,
): Promise<number> {
  const existingState = context.existingState;
  const setMatch = resolveSetMatch(portableSet, packId, existingState);

  if (!setMatch.entity) {
    return insertPortableSet(portableSet, packId, preservePortableIds, context);
  }

  const existingSet = setMatch.entity;
  registerEntityId(context.setIds, portableSet.sourceId, portableSet.portableId, existingSet.id!);
  let materiallyChanged = false;

  if ((!existingSet.description || existingSet.description.trim() === '') && portableSet.description?.trim()) {
    await db.sets.update(existingSet.id!, { description: portableSet.description });
    existingSet.description = portableSet.description;
    materiallyChanged = true;
  }

  for (const portableCard of portableSet.cards) {
    const existingCards = existingState.cardsBySetId.get(existingSet.id!) ?? [];
    const cardMatch = resolveCardMatch(portableCard, existingCards);

    switch (cardMatch.outcome) {
      case 'create':
        await insertPortableCard(portableCard, existingSet.id!, preservePortableIds, context);
        materiallyChanged = true;
        break;
      case 'duplicate':
        registerCardTarget(context.cardTargets, portableCard, { localId: cardMatch.existingCard.id!, created: false });
        break;
      case 'conflict':
        if (cardMatch.reason === 'portableId-changed-content') {
          await db.cards.update(cardMatch.existingCard.id!, {
            question: portableCard.question,
            answer: portableCard.answer,
          });
          cardMatch.existingCard.question = portableCard.question;
          cardMatch.existingCard.answer = portableCard.answer;
          registerCardTarget(context.cardTargets, portableCard, { localId: cardMatch.existingCard.id!, created: false });
        } else {
          await insertPortableCard(portableCard, existingSet.id!, preservePortableIds, context);
        }
        materiallyChanged = true;
        break;
    }
  }

  if (materiallyChanged && existingState.activeSessionsBySetId.has(existingSet.id!)) {
    await db.activeSessions.where('setId').equals(existingSet.id!).delete();
    existingState.activeSessionsBySetId.delete(existingSet.id!);
  }

  return existingSet.id!;
}

async function insertPortablePack(
  portablePack: PortablePack,
  preservePortableIds: boolean,
  context: ImportExecutionContext,
): Promise<number> {
  const portableId = resolvePortableId(portablePack.portableId, preservePortableIds, context.existingState.packsByPortableId);
  const packId = await db.packs.add({
    portableId,
    name: portablePack.name,
    color: portablePack.color,
    createdAt: portablePack.createdAt,
  });
  const insertedPack: Pack = {
    id: packId,
    portableId,
    name: portablePack.name,
    color: portablePack.color,
    createdAt: portablePack.createdAt,
  };
  addPackToState(context.existingState, insertedPack);

  for (const portableSet of portablePack.sets) {
    await insertPortableSet(portableSet, packId, preservePortableIds, context);
  }

  return packId;
}

async function insertPortableSet(
  portableSet: PortableSet,
  packId: number,
  preservePortableIds: boolean,
  context: ImportExecutionContext,
): Promise<number> {
  const portableId = resolvePortableId(portableSet.portableId, preservePortableIds, context.existingState.setsByPortableId);
  const setId = await db.sets.add({
    packId,
    portableId,
    title: portableSet.title,
    description: portableSet.description,
    createdAt: portableSet.createdAt,
  });
  addSetToState(context.existingState, {
    id: setId,
    packId,
    portableId,
    title: portableSet.title,
    description: portableSet.description,
    createdAt: portableSet.createdAt,
  });
  registerEntityId(context.setIds, portableSet.sourceId, portableSet.portableId, setId);

  for (const portableCard of portableSet.cards) {
    await insertPortableCard(portableCard, setId, preservePortableIds, context);
  }

  return setId;
}

async function insertPortableCard(
  portableCard: PortableCard,
  setId: number,
  preservePortableIds: boolean,
  context: ImportExecutionContext,
): Promise<number> {
  const portableId = resolvePortableId(portableCard.portableId, preservePortableIds, context.existingState.cardsByPortableId);
  const cardId = await db.cards.add({
    setId,
    portableId,
    question: portableCard.question,
    answer: portableCard.answer,
    createdAt: portableCard.createdAt,
  });
  addCardToState(context.existingState, {
    id: cardId,
    setId,
    portableId,
    question: portableCard.question,
    answer: portableCard.answer,
    createdAt: portableCard.createdAt,
  });
  registerCardTarget(context.cardTargets, portableCard, { localId: cardId, created: true });
  return cardId;
}

async function requireTargetPack(targetPackId: number | undefined): Promise<Pack> {
  if (targetPackId == null) {
    throw new Error('Set imports require a target pack.');
  }

  const targetPack = await db.packs.get(targetPackId);
  if (!targetPack || targetPack.id == null) {
    throw new Error('Target pack was not found.');
  }

  return targetPack;
}

async function deletePackCascade(packId: number): Promise<void> {
  const sets = await db.sets.where('packId').equals(packId).toArray();
  const setIds = sets.flatMap((set) => (set.id == null ? [] : [set.id]));

  if (setIds.length > 0) {
    await deleteSetDescendants(setIds);
    await db.sets.bulkDelete(setIds);
  }

  await db.packs.delete(packId);
}

async function deleteSetCascade(setId: number): Promise<void> {
  await deleteSetDescendants([setId]);
  await db.sets.delete(setId);
}

async function deleteSetDescendants(setIds: number[]): Promise<void> {
  if (setIds.length === 0) {
    return;
  }

  const cards = await db.cards.where('setId').anyOf(setIds).toArray();
  const cardIds = cards.flatMap((card) => (card.id == null ? [] : [card.id]));
  const sessions = await db.sessions.where('setId').anyOf(setIds).toArray();
  const sessionIds = sessions.flatMap((session) => (session.id == null ? [] : [session.id]));

  if (sessionIds.length > 0) {
    await db.results.where('sessionId').anyOf(sessionIds).delete();
    await db.sessions.bulkDelete(sessionIds);
  }

  if (cardIds.length > 0) {
    await db.stats.where('cardId').anyOf(cardIds).delete();
    await db.cards.bulkDelete(cardIds);
  }

  await db.activeSessions.where('setId').anyOf(setIds).delete();
}

async function clearAffectedActiveSessions(sessions: AffectedActiveSession[]): Promise<void> {
  const setIds = sessions.map((session) => session.setId);
  if (setIds.length === 0) {
    return;
  }

  await db.activeSessions.where('setId').anyOf(setIds).delete();
}

function addPackToState(existingState: ImportState, pack: Pack): void {
  existingState.packs.push(pack);
  if (pack.portableId) {
    existingState.packsByPortableId.set(pack.portableId, pack);
  }
  const key = normaliseNameOrTitle(pack.name);
  const existing = existingState.packsByNormalisedName.get(key);
  if (existing) {
    existing.push(pack);
  } else {
    existingState.packsByNormalisedName.set(key, [pack]);
  }
}

function addSetToState(existingState: ImportState, set: FlashSet): void {
  existingState.sets.push(set);
  if (set.portableId) {
    existingState.setsByPortableId.set(set.portableId, set);
  }
  const byPack = existingState.setsByPackId.get(set.packId);
  if (byPack) {
    byPack.push(set);
  } else {
    existingState.setsByPackId.set(set.packId, [set]);
  }

  const titlesByPack = existingState.setsByPackAndNormalisedTitle.get(set.packId) ?? new Map<string, FlashSet[]>();
  const titleKey = normaliseNameOrTitle(set.title);
  const byTitle = titlesByPack.get(titleKey);
  if (byTitle) {
    byTitle.push(set);
  } else {
    titlesByPack.set(titleKey, [set]);
  }
  existingState.setsByPackAndNormalisedTitle.set(set.packId, titlesByPack);
}

function addCardToState(existingState: ImportState, card: Card): void {
  existingState.cards.push(card);
  if (card.portableId) {
    existingState.cardsByPortableId.set(card.portableId, card);
  }
  const existing = existingState.cardsBySetId.get(card.setId);
  if (existing) {
    existing.push(card);
  } else {
    existingState.cardsBySetId.set(card.setId, [card]);
  }
}

function addSessionToState(existingState: ImportState, session: Session): void {
  existingState.sessions.push(session);
  if (session.portableId) {
    existingState.sessionsByPortableId.set(session.portableId, session);
  }
}

function resolvePortableId(
  portableId: string | undefined,
  preservePortableIds: boolean,
  existingPortableIds?: { has: (value: string) => boolean },
): string {
  if (preservePortableIds && portableId && !existingPortableIds?.has(portableId)) {
    return portableId;
  }

  return globalThis.crypto.randomUUID();
}

function downloadJsonFile(filename: string, payload: PortableImportFile): void {
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
