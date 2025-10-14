// runs shell commands reliably and streams output
import execa from "execa";

export async function runCmd(cmd, args, opts = {}) {
    const child = execa(cmd, args, { stdio: "pipe", ...opts });
    child.stdout.pipe(process.stdout);
    child.stderr.pipe(process.stderr);
    const result = await child;
    return { stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode ?? 0 };
}
