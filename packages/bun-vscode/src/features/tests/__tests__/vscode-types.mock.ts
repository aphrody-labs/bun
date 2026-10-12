/**
 * Mock VSCode types and classes for testing
 * These should be as close as possible to the real VSCode API
 */

import type * as vscode from "vscode";

function mockEvent<T>(): vscode.Event<T> {
  return (_listener: (e: T) => unknown) => new MockDisposable();
}

export class MockUri implements vscode.Uri {
  constructor(
    public readonly scheme: string,
    public readonly authority: string,
    public readonly path: string,
    public readonly query: string,
    public readonly fragment: string,
    public readonly fsPath: string,
  ) {}

  static file(path: string): MockUri {
    return new MockUri("file", "", path, "", "", path);
  }

  static parse(value: string): MockUri {
    const url = new URL(value);
    const path = decodeURIComponent(url.pathname);
    return new MockUri(url.protocol.slice(0, -1), url.host, path, url.search.slice(1), url.hash.slice(1), path);
  }

  with(change: { scheme?: string; authority?: string; path?: string; query?: string; fragment?: string }): MockUri {
    const path = change.path ?? this.path;
    return new MockUri(
      change.scheme ?? this.scheme,
      change.authority ?? this.authority,
      path,
      change.query ?? this.query,
      change.fragment ?? this.fragment,
      change.path === undefined ? this.fsPath : path,
    );
  }

  toString(_skipEncoding?: boolean): string {
    return `${this.scheme}://${this.authority}${this.path}`;
  }

  toJSON() {
    const { scheme, authority, path, query, fragment, fsPath } = this;
    return { scheme, authority, path, query, fragment, fsPath };
  }
}

export class MockPosition implements vscode.Position {
  constructor(
    public readonly line: number,
    public readonly character: number,
  ) {}

  isBefore(other: vscode.Position): boolean {
    return this.compareTo(other) < 0;
  }

  isBeforeOrEqual(other: vscode.Position): boolean {
    return this.compareTo(other) <= 0;
  }

  isAfter(other: vscode.Position): boolean {
    return this.compareTo(other) > 0;
  }

  isAfterOrEqual(other: vscode.Position): boolean {
    return this.compareTo(other) >= 0;
  }

  isEqual(other: vscode.Position): boolean {
    return this.compareTo(other) === 0;
  }

  compareTo(other: vscode.Position): number {
    return this.line - other.line || this.character - other.character;
  }

  translate(
    lineDeltaOrChange?: number | { lineDelta?: number; characterDelta?: number },
    characterDelta: number = 0,
  ): MockPosition {
    const change =
      typeof lineDeltaOrChange === "object" ? lineDeltaOrChange : { lineDelta: lineDeltaOrChange, characterDelta };
    return new MockPosition(this.line + (change.lineDelta ?? 0), this.character + (change.characterDelta ?? 0));
  }

  with(lineOrChange?: number | { line?: number; character?: number }, character?: number): MockPosition {
    const change = typeof lineOrChange === "object" ? lineOrChange : { line: lineOrChange, character };
    return new MockPosition(change.line ?? this.line, change.character ?? this.character);
  }
}

export class MockRange implements vscode.Range {
  public readonly start: vscode.Position;
  public readonly end: vscode.Position;

  constructor(start: vscode.Position, end: vscode.Position);
  constructor(startLine: number, startCharacter: number, endLine: number, endCharacter: number);
  constructor(
    startOrLine: vscode.Position | number,
    endOrCharacter: vscode.Position | number,
    endLine?: number,
    endCharacter?: number,
  ) {
    if (typeof startOrLine === "number" && typeof endOrCharacter === "number") {
      this.start = new MockPosition(startOrLine, endOrCharacter);
      this.end = new MockPosition(endLine ?? startOrLine, endCharacter ?? endOrCharacter);
    } else if (typeof startOrLine === "object" && typeof endOrCharacter === "object") {
      [this.start, this.end] = startOrLine.isAfter(endOrCharacter)
        ? [endOrCharacter, startOrLine]
        : [startOrLine, endOrCharacter];
    } else {
      throw new TypeError("Invalid arguments");
    }
  }

  get isEmpty(): boolean {
    return this.start.isEqual(this.end);
  }

  get isSingleLine(): boolean {
    return this.start.line === this.end.line;
  }

  contains(positionOrRange: vscode.Position | vscode.Range): boolean {
    if ("start" in positionOrRange) {
      return this.contains(positionOrRange.start) && this.contains(positionOrRange.end);
    }
    return positionOrRange.isAfterOrEqual(this.start) && positionOrRange.isBeforeOrEqual(this.end);
  }

  isEqual(other: vscode.Range): boolean {
    return this.start.isEqual(other.start) && this.end.isEqual(other.end);
  }

  intersection(range: vscode.Range): MockRange | undefined {
    const start = range.start.isAfter(this.start) ? range.start : this.start;
    const end = range.end.isBefore(this.end) ? range.end : this.end;
    return start.isAfter(end) ? undefined : new MockRange(start, end);
  }

  union(other: vscode.Range): MockRange {
    const start = other.start.isBefore(this.start) ? other.start : this.start;
    const end = other.end.isAfter(this.end) ? other.end : this.end;
    return new MockRange(start, end);
  }

  with(
    startOrChange?: vscode.Position | { start?: vscode.Position; end?: vscode.Position },
    end?: vscode.Position,
  ): MockRange {
    const change = startOrChange && !("line" in startOrChange) ? startOrChange : { start: startOrChange, end };
    return new MockRange(change.start ?? this.start, change.end ?? this.end);
  }
}

export class MockLocation implements vscode.Location {
  public range: vscode.Range;

  constructor(
    public uri: vscode.Uri,
    rangeOrPosition: vscode.Range | vscode.Position,
  ) {
    this.range = "start" in rangeOrPosition ? rangeOrPosition : new MockRange(rangeOrPosition, rangeOrPosition);
  }
}

export class MockTestTag implements vscode.TestTag {
  constructor(public readonly id: string) {}
}

export class MockTestMessage {
  public location?: MockLocation;
  public actualOutput?: string;
  public expectedOutput?: string;

  constructor(public message: string | MockMarkdownString) {}

  static diff(message: string, expected: string, actual: string): MockTestMessage {
    const msg = new MockTestMessage(message);
    msg.expectedOutput = expected;
    msg.actualOutput = actual;
    return msg;
  }
}

export class MockMarkdownString {
  constructor(public value: string = "") {}

  appendCodeblock(code: string, language?: string): MockMarkdownString {
    this.value += `\n\`\`\`${language || ""}\n${code}\n\`\`\``;
    return this;
  }

  appendMarkdown(value: string): MockMarkdownString {
    this.value += value;
    return this;
  }

  appendText(value: string): MockMarkdownString {
    this.value += value.replace(/[\\`*_{}[\]()#+\-.!]/g, "\\$&");
    return this;
  }
}

export class MockTestItemCollection implements vscode.TestItemCollection {
  private items = new Map<string, vscode.TestItem>();

  get size(): number {
    return this.items.size;
  }

  add(item: vscode.TestItem): void {
    this.items.set(item.id, item);
  }

  replace(items: readonly vscode.TestItem[]): void {
    this.items.clear();
    for (const item of items) {
      this.items.set(item.id, item);
    }
  }

  forEach(callback: (item: vscode.TestItem, collection: vscode.TestItemCollection) => unknown, thisArg?: unknown): void {
    this.items.forEach(item => callback.call(thisArg, item, this));
  }

  get(itemId: string): vscode.TestItem | undefined {
    return this.items.get(itemId);
  }

  delete(itemId: string): void {
    this.items.delete(itemId);
  }

  [Symbol.iterator](): Iterator<[id: string, testItem: vscode.TestItem]> {
    return this.items[Symbol.iterator]();
  }

  clear(): void {
    this.items.clear();
  }

  set(id: string, item: vscode.TestItem): void {
    this.items.set(id, item);
  }

  values(): IterableIterator<vscode.TestItem> {
    return this.items.values();
  }

  keys(): IterableIterator<string> {
    return this.items.keys();
  }

  entries(): IterableIterator<[string, vscode.TestItem]> {
    return this.items.entries();
  }
}

export class MockTestItem implements vscode.TestItem {
  public canResolveChildren: boolean = false;
  public busy: boolean = false;
  public description?: string;
  public sortText?: string;
  public range: vscode.Range | undefined;
  public error: string | vscode.MarkdownString | undefined;
  public readonly children = new MockTestItemCollection();

  constructor(
    public readonly id: string,
    public label: string,
    public readonly uri: vscode.Uri | undefined = undefined,
    public readonly parent: vscode.TestItem | undefined = undefined,
    public tags: readonly vscode.TestTag[] = [],
  ) {}
}

type RunHandler = (request: vscode.TestRunRequest, token: vscode.CancellationToken) => Thenable<void> | void;

export class MockTestController implements vscode.TestController {
  public readonly items = new MockTestItemCollection();
  public resolveHandler?: (item: vscode.TestItem | undefined) => Thenable<void> | void;
  public refreshHandler: ((token: vscode.CancellationToken) => Thenable<void> | void) | undefined;

  constructor(
    public readonly id: string,
    public label: string,
  ) {}

  createTestItem(id: string, label: string, uri?: vscode.Uri): MockTestItem {
    return new MockTestItem(id, label, uri);
  }

  createRunProfile(
    label: string,
    kind: vscode.TestRunProfileKind,
    runHandler: RunHandler,
    isDefault?: boolean,
    tag?: vscode.TestTag,
    supportsContinuousRun?: boolean,
  ): MockTestRunProfile {
    return new MockTestRunProfile(label, kind, runHandler, isDefault, tag, supportsContinuousRun);
  }

  createTestRun(_request: vscode.TestRunRequest, name?: string, persist?: boolean): MockTestRun {
    return new MockTestRun(name, persist);
  }

  invalidateTestResults(_items?: vscode.TestItem | readonly vscode.TestItem[]): void {
    // Mock implementation - in real VSCode this would invalidate test results
  }

  dispose(): void {
    this.items.clear();
  }
}

export enum MockTestRunProfileKind {
  Run = 1,
  Debug = 2,
  Coverage = 3,
}

export class MockTestRunProfile implements vscode.TestRunProfile {
  public readonly onDidChangeDefault = mockEvent<boolean>();
  public configureHandler: (() => void) | undefined;

  constructor(
    public label: string,
    public readonly kind: vscode.TestRunProfileKind,
    public runHandler: RunHandler,
    public isDefault: boolean = false,
    public tag: vscode.TestTag | undefined = undefined,
    public supportsContinuousRun: boolean = false,
  ) {}

  dispose(): void {
    // No-op for mock
  }
}

export class MockTestRunRequest implements vscode.TestRunRequest {
  constructor(
    public readonly include: readonly vscode.TestItem[] | undefined = undefined,
    public readonly exclude: readonly vscode.TestItem[] | undefined = undefined,
    public readonly profile: vscode.TestRunProfile | undefined = undefined,
    public readonly continuous: boolean = false,
    public readonly preserveFocus: boolean = true,
  ) {}
}

export class MockTestRun implements vscode.TestRun {
  public readonly token = new MockCancellationToken();
  public readonly onDidDispose = mockEvent<void>();
  private _ended: boolean = false;

  constructor(
    public readonly name: string | undefined = undefined,
    public readonly isPersisted: boolean = true,
  ) {}

  appendOutput(_output: string, _location?: vscode.Location, _test?: vscode.TestItem): void {
    if (this._ended) return;
    // For mock, just store output - in real VS Code this would appear in test output
  }

  addCoverage(_fileCoverage: vscode.FileCoverage): void {
    if (this._ended) return;
    // Mock implementation
  }

  end(): void {
    this._ended = true;
  }

  enqueued(_test: vscode.TestItem): void {
    if (this._ended) return;
    // Mock implementation
  }

  errored(_test: vscode.TestItem, _message: vscode.TestMessage | readonly vscode.TestMessage[], _duration?: number): void {
    if (this._ended) return;
    // Mock implementation
  }

  failed(_test: vscode.TestItem, _message: vscode.TestMessage | readonly vscode.TestMessage[], _duration?: number): void {
    if (this._ended) return;
    // Mock implementation
  }

  passed(_test: vscode.TestItem, _duration?: number): void {
    if (this._ended) return;
    // Mock implementation
  }

  skipped(_test: vscode.TestItem): void {
    if (this._ended) return;
    // Mock implementation
  }

  started(_test: vscode.TestItem): void {
    if (this._ended) return;
    // Mock implementation
  }
}

export class MockCancellationToken implements vscode.CancellationToken {
  private _isCancellationRequested: boolean = false;
  private _listeners: ((e: unknown) => unknown)[] = [];

  get isCancellationRequested(): boolean {
    return this._isCancellationRequested;
  }

  readonly onCancellationRequested = (listener: (e: unknown) => unknown): MockDisposable => {
    this._listeners.push(listener);
    return new MockDisposable(() => {
      const index = this._listeners.indexOf(listener);
      if (index >= 0) {
        this._listeners.splice(index, 1);
      }
    });
  };

  cancel(): void {
    this._isCancellationRequested = true;
    this._listeners.forEach(listener => listener(undefined));
  }
}

export class MockDisposable implements vscode.Disposable {
  constructor(private readonly disposeFunc?: () => void) {}

  dispose(): void {
    this.disposeFunc?.();
  }
}

export interface MockTextDocument {
  readonly uri: MockUri;
  readonly fileName: string;
  readonly isUntitled: boolean;
  readonly languageId: string;
  readonly version: number;
  readonly isDirty: boolean;
  readonly isClosed: boolean;
  readonly eol: MockEndOfLine;
  readonly lineCount: number;
  getText(range?: MockRange): string;
  getWordRangeAtPosition(position: MockPosition, regex?: RegExp): MockRange | undefined;
  lineAt(line: number | MockPosition): MockTextLine;
  offsetAt(position: MockPosition): number;
  positionAt(offset: number): MockPosition;
  save(): Promise<boolean>;
  validatePosition(position: MockPosition): MockPosition;
  validateRange(range: MockRange): MockRange;
}

export enum MockEndOfLine {
  LF = 1,
  CRLF = 2,
}

export interface MockTextLine {
  readonly lineNumber: number;
  readonly text: string;
  readonly range: MockRange;
  readonly rangeIncludingLineBreak: MockRange;
  readonly firstNonWhitespaceCharacterIndex: number;
  readonly isEmptyOrWhitespace: boolean;
}

export class MockWorkspaceFolder implements vscode.WorkspaceFolder {
  constructor(
    public readonly uri: vscode.Uri,
    public readonly name: string,
    public readonly index: number = 0,
  ) {}
}

export class MockFileSystemWatcher {
  public readonly ignoreCreateEvents: boolean = false;
  public readonly ignoreChangeEvents: boolean = false;
  public readonly ignoreDeleteEvents: boolean = false;

  private _createListeners: ((uri: MockUri) => void)[] = [];
  private _changeListeners: ((uri: MockUri) => void)[] = [];
  private _deleteListeners: ((uri: MockUri) => void)[] = [];

  onDidCreate(listener: (uri: MockUri) => void): MockDisposable {
    this._createListeners.push(listener);
    return new MockDisposable(() => {
      const index = this._createListeners.indexOf(listener);
      if (index >= 0) this._createListeners.splice(index, 1);
    });
  }

  onDidChange(listener: (uri: MockUri) => void): MockDisposable {
    this._changeListeners.push(listener);
    return new MockDisposable(() => {
      const index = this._changeListeners.indexOf(listener);
      if (index >= 0) this._changeListeners.splice(index, 1);
    });
  }

  onDidDelete(listener: (uri: MockUri) => void): MockDisposable {
    this._deleteListeners.push(listener);
    return new MockDisposable(() => {
      const index = this._deleteListeners.indexOf(listener);
      if (index >= 0) this._deleteListeners.splice(index, 1);
    });
  }

  dispose(): void {
    this._createListeners.length = 0;
    this._changeListeners.length = 0;
    this._deleteListeners.length = 0;
  }

  // Helper methods for testing
  triggerCreate(uri: MockUri): void {
    this._createListeners.forEach(listener => listener(uri));
  }

  triggerChange(uri: MockUri): void {
    this._changeListeners.forEach(listener => listener(uri));
  }

  triggerDelete(uri: MockUri): void {
    this._deleteListeners.forEach(listener => listener(uri));
  }
}

export class MockRelativePattern {
  constructor(
    public readonly base: string | MockWorkspaceFolder,
    public readonly pattern: string,
  ) {}

  get baseUri(): vscode.Uri {
    if (typeof this.base === "string") {
      return MockUri.file(this.base);
    }
    return this.base.uri;
  }
}

export interface MockConfigurationInspect<T> {
  readonly key: string;
  readonly defaultValue?: T;
  readonly globalValue?: T;
  readonly workspaceValue?: T;
  readonly workspaceFolderValue?: T;
}

export enum MockConfigurationTarget {
  Global = 1,
  Workspace = 2,
  WorkspaceFolder = 3,
}

export class MockConfiguration {
  private _values = new Map<string, any>();

  get<T>(section: string, defaultValue?: T): T | undefined {
    return this._values.get(section) ?? defaultValue;
  }

  has(section: string): boolean {
    return this._values.has(section);
  }

  inspect<T>(section: string): MockConfigurationInspect<T> | undefined {
    return {
      key: section,
      defaultValue: undefined,
      globalValue: this._values.get(section),
      workspaceValue: undefined,
      workspaceFolderValue: undefined,
    };
  }

  async update(section: string, value: any, _configurationTarget?: MockConfigurationTarget): Promise<void> {
    this._values.set(section, value);
  }

  // Helper for testing
  setValue(section: string, value: any): void {
    this._values.set(section, value);
  }
}
