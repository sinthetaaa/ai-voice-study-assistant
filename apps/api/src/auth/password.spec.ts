import { hashPassword, verifyPassword } from './password';

describe('password hashing', () => {
  it('verifies the correct password', async () => {
    const password = 'correct-horse-battery-staple';

    const encoded = await hashPassword(password);

    expect(encoded).toMatch(/^scrypt:v1:/);

    expect(encoded).not.toContain(password);

    await expect(verifyPassword(password, encoded)).resolves.toBe(true);
  });

  it('rejects an incorrect password', async () => {
    const encoded = await hashPassword('correct-horse-battery-staple');

    await expect(verifyPassword('wrong-password', encoded)).resolves.toBe(
      false,
    );
  });

  it('rejects malformed hashes safely', async () => {
    await expect(verifyPassword('anything', 'not-a-valid-hash')).resolves.toBe(
      false,
    );
  });
});
