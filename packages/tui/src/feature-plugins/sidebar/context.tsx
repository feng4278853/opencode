import { Plugin } from "@opencode/plugin/tui"
import { createMemo, For, Show } from "solid-js"
import { contextUsage } from "../../util/session"

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
})

// Four-tier scale for per-request cache hit rates: red -> amber -> orange -> mint.
function sparkColor(rate: number) {
  if (rate >= 90) return "#7ed5c0"
  if (rate >= 75) return "#e5c07b"
  if (rate >= 50) return "#e08c5f"
  return "#d96c6c"
}

const TREND_LIMIT = 24

export function SidebarContext(props: { context: Plugin.Context; sessionID: string }) {
  const theme = props.context.theme
  const msg = createMemo(() => props.context.data.session.message.list(props.sessionID))
  const session = createMemo(() => props.context.data.session.get(props.sessionID))
  const cost = createMemo(() => props.context.data.session.cost(props.sessionID))

  const state = createMemo(() =>
    contextUsage(msg(), props.context.data.location.model.list(session()?.location), session()?.revert?.messageID),
  )

  const hit = createMemo(() => {
    let cumRead = 0
    let cumInput = 0
    const history: number[] = []
    for (const message of msg() ?? []) {
      if (message.type !== "assistant" || !message.tokens) continue
      const total = message.tokens.input + message.tokens.cache.read
      if (total <= 0) continue
      cumRead += message.tokens.cache.read
      cumInput += message.tokens.input
      history.push(Math.round((message.tokens.cache.read / total) * 100))
    }
    const cumTotal = cumRead + cumInput
    return {
      cumHit: cumTotal > 0 ? Math.round((cumRead / cumTotal) * 100) : undefined,
      last: history.length ? history[history.length - 1] : undefined,
      history: history.slice(-TREND_LIMIT),
    }
  })

  return (
    <Show when={state() || cost() > 0}>
      <box>
        <text fg={theme.text.base}>
          <b>Context</b>
        </text>
        <Show when={state()}>
          {(value) => (
            <>
              <text fg={theme.text.muted}>{value().tokens.toLocaleString()} tokens</text>
              <Show when={value().percent !== undefined}>
                <text fg={theme.text.muted}>{value().percent}% used</text>
              </Show>
            </>
          )}
        </Show>
        <Show when={hit().cumHit !== undefined}>
          <text fg={theme.text.muted}>
            hit (cum): {hit().cumHit}% · hit (last): {hit().last}%
          </text>
          <box flexDirection="row">
            <For each={hit().history}>{(rate) => <text fg={sparkColor(rate)}>█</text>}</For>
          </box>
        </Show>
        <Show when={cost() > 0}>
          <text fg={theme.text.muted}>{money.format(cost())} spent</text>
        </Show>
      </box>
    </Show>
  )
}

export default Plugin.define({
  id: "mycode.sidebar.context",
  setup(context) {
    context.ui.slot({
      append: "sidebar.content",
      render: (props) => <SidebarContext context={context} sessionID={props.sessionID} />,
    })
  },
})
