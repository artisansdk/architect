/**
 * Encrypts and decrypts values with an application key.
 */
export interface Contract {
    /**
     * Encrypts a value, serializing it to JSON first unless `serialize` is false.
     */
    encrypt(value: unknown, serialize?: boolean): Promise<string>
    /**
     * Decrypts a payload, parsing the JSON back into a value unless `unserialize` is false.
     */
    decrypt(payload: string, unserialize?: boolean): Promise<unknown>
    /**
     * Encrypts a string without serialization.
     */
    encryptString(value: string): Promise<string>
    /**
     * Decrypts a payload without unserialization.
     */
    decryptString(payload: string): Promise<string>
    /**
     * Returns the current encryption key.
     */
    getKey(): Uint8Array
    /**
     * Returns the current key followed by the previous keys, in the order decryption tries them.
     */
    getAllKeys(): Uint8Array[]
    /**
     * Returns the keys that can still decrypt but are no longer used to encrypt.
     */
    getPreviousKeys(): Uint8Array[]
}
