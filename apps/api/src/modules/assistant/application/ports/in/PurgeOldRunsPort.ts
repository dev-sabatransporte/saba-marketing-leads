export interface PurgeOldRunsResult {
  deleted: number;
}

export interface PurgeOldRunsPort {
  /** Deletes the runs past their retention. */
  execute(): Promise<PurgeOldRunsResult>;
}
