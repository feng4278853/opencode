import { TextAttributes } from "@opentui/core"
import type { JSX } from "solid-js"
import { useTheme } from "../context/theme"

export function Logo() {
  const { theme } = useTheme()

  return (
    <box flexDirection="column" alignItems="center">
      <text
        fg={theme.primary}
        attributes={TextAttributes.BOLD}
        selectable={false}
      >
        mycode
      </text>
      <text fg={theme.textMuted} attributes={TextAttributes.DIM} selectable={false}>
        AI coding agent
      </text>
    </box>
  )
}