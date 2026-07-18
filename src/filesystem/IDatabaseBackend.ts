/**
 * Interface for database backend implementations.
 * 
 * This interface defines the contract for persistent storage backends used by VirtualFileSystem.
 * Implementations must handle schema creation, data persistence, and proper resource cleanup.
 * 
 * Methods can be either synchronous or asynchronous (returning Promises).
 * The backend is responsible for managing its own connection lifecycle.
 * 
 * Implementations should have a constructor that accepts a dbPath parameter:
 *   constructor(dbPath: string)
 * 
 * The constructor should:
 * - Open or create the database at the specified path
 * - Create required tables if they don't exist (files, kv, exports)
 * - Create indexes for TTL columns if they don't exist
 */
export interface IDatabaseBackend {

    /**
     * Retrieves all key-value entries from the database.
     * 
     * @returns Array of all KV entries with their keys, values, and TTL timestamps
     */
    selectAllKV(): Promise<Array<{ key: string; value: string; ttl: string }>> | Array<{ key: string; value: string; ttl: string }>;

    /**
     * Retrieves all file entries from the database.
     * 
     * @returns Array of all file entries with their names, binary data, and TTL timestamps
     */
    selectAllFiles(): Promise<Array<{ name: string; data: Buffer; ttl: string }>> | Array<{ name: string; data: Buffer; ttl: string }>;

    /**
     * Retrieves all export entries from the database.
     * 
     * @returns Array of all export entries with their keys, names, TTL timestamps, and binary data
     */
    selectAllExports(): Promise<Array<{ key: string; name: string; ttl: string; data: Buffer }>> | Array<{ key: string; name: string; ttl: string; data: Buffer }>;

    /**
     * Deletes all entries from the KV table.
     * 
     * This is used during flush operations to clear the table before re-inserting current state.
     */
    deleteAllKV(): Promise<void> | void;

    /**
     * Deletes all entries from the files table.
     * 
     * This is used during flush operations to clear the table before re-inserting current state.
     */
    deleteAllFiles(): Promise<void> | void;

    /**
     * Deletes all entries from the exports table.
     * 
     * This is used during flush operations to clear the table before re-inserting current state.
     */
    deleteAllExports(): Promise<void> | void;

    /**
     * Inserts a key-value entry into the database.
     * 
     * @param key - The unique key for this entry
     * @param value - The string value to store
     * @param ttl - ISO 8601 timestamp indicating when this entry expires
     */
    insertKV(key: string, value: string, ttl: string): Promise<void> | void;

    /**
     * Inserts a file entry into the database.
     * 
     * @param name - The unique filename
     * @param data - The binary file data
     * @param ttl - ISO 8601 timestamp indicating when this entry expires
     */
    insertFile(name: string, data: Uint8Array, ttl: string): Promise<void> | void;

    /**
     * Inserts an export entry into the database.
     * 
     * @param key - The unique export key (UUID)
     * @param name - The original filename
     * @param ttl - ISO 8601 timestamp indicating when this export expires
     * @param data - The binary file data
     */
    insertExport(key: string, name: string, ttl: string, data: Uint8Array): Promise<void> | void;

    /**
     * Inserts or replaces a key-value entry in the database.
     * 
     * If an entry with the same key exists, it should be replaced.
     * Otherwise, a new entry should be inserted.
     * 
     * @param key - The unique key for this entry
     * @param value - The string value to store
     * @param ttl - ISO 8601 timestamp indicating when this entry expires
     */
    insertOrReplaceKV(key: string, value: string, ttl: string): Promise<void> | void;

    /**
     * Inserts or replaces a file entry in the database.
     * 
     * If an entry with the same name exists, it should be replaced.
     * Otherwise, a new entry should be inserted.
     * 
     * @param name - The unique filename
     * @param data - The binary file data
     * @param ttl - ISO 8601 timestamp indicating when this entry expires
     */
    insertOrReplaceFile(name: string, data: Uint8Array, ttl: string): Promise<void> | void;

    /**
     * Inserts or replaces an export entry in the database.
     *
     * If an entry with the same key exists, it should be replaced.
     * Otherwise, a new entry should be inserted.
     *
     * @param key - The unique export key
     * @param name - The associated filename
     * @param ttl - ISO 8601 timestamp indicating when this entry expires
     * @param data - The binary export data
     */
    insertOrReplaceExport(key: string, name: string, ttl: string, data: Uint8Array): Promise<void> | void;

    /**
     * Retrieves the TTL timestamp for a specific file.
     * 
     * @param name - The filename to query
     * @returns The TTL timestamp, or undefined if the file doesn't exist
     */
    selectFileTTL(name: string): Promise<{ ttl: string } | undefined> | { ttl: string } | undefined;

    /**
     * Retrieves the TTL timestamp for a specific KV entry.
     * 
     * @param key - The key to query
     * @returns The TTL timestamp, or undefined if the key doesn't exist
     */
    selectKVTTL(key: string): Promise<{ ttl: string } | undefined> | { ttl: string } | undefined;

    /**
     * Retrieves the value for a specific KV entry.
     * 
     * @param key - The key to query
     * @returns The value, or undefined if the key doesn't exist
     */
    selectKVValue(key: string): Promise<{ value: string } | undefined> | { value: string } | undefined;

    /**
     * Executes a function within a database transaction.
     * 
     * All database operations within the function should be atomic.
     * If the function throws, the transaction should be rolled back.
     * If the function succeeds, the transaction should be committed.
     * 
     * Note: Some backends (e.g., Cloudflare KV/R2) may not support true transactions.
     * In such cases, the function is executed directly without atomicity guarantees.
     * 
     * @param fn - The function to execute within the transaction
     * @returns The return value of the function
     * @throws Re-throws any exception from the function
     */
    transaction<T>(fn: () => T): Promise<T> | T;

    /**
     * Closes the database connection and releases resources.
     * 
     * This method should be idempotent - calling it multiple times should not throw.
     * After calling close(), the backend should not be used for further operations.
     */
    close(): Promise<void> | void;
}
