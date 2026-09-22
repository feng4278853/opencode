import { TextAttributes } from "@opentui/core"
import { type JSX } from "solid-js"
import { useTerminalDimensions } from "@opentui/solid"
import { useTheme } from "../context/theme"

export function Logo() {
  const theme = useTheme()
  const dimensions = useTerminalDimensions()

  const name = dimensions().width < 22 ? "mycode" : "mycode-v2"

  return (
    <box alignItems="center">
      <text fg={theme.text.base} attributes={TextAttributes.BOLD} selectable={false}>
        {name}
      </text>
      <text fg={theme.text.muted} selectable={false}>
        AI coding agent
      </text>
    </box>
  )
}
