import { configDefaults, defineConfig } from "vitest/config";

// trash-can(지울 파일을 옮겨 둔 곳)의 옛 시험은 돌리지 않는다.
export default defineConfig({ test: { exclude: [...configDefaults.exclude, "trash-can/**"] } });
