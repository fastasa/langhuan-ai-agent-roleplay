/**
 * 启动前清理脚本 - 自动杀掉占用3000端口的进程
 */
import { exec } from 'child_process'

// 查找占用3000端口的进程
exec('netstat -ano | findstr :3000 | findstr LISTENING', (err, stdout) => {
  if (stdout) {
    const lines = stdout.trim().split('\n')
    for (const line of lines) {
      const parts = line.trim().split(/\s+/)
      const pid = parts[parts.length - 1]
      if (pid && /^\d+$/.test(pid)) {
        console.log(`[清理] 杀掉占用3000端口的进程 PID: ${pid}`)
        exec(`taskkill /PID ${pid} /F`, () => {})
      }
    }
  }
})
