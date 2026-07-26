let workerEnv: unknown;

export function setWorkerEnv(env: unknown): void {
	workerEnv = env;
}

export function getWorkerEnv(): unknown {
	return workerEnv;
}