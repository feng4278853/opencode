import type { AssistantMessage } from "@opencode-ai/sdk/v2"
import type { TuiPlugin, TuiPluginApi } from "@opencode-ai/plugin/tui"
import type { BuiltinTuiPlugin } from "../builtins"
import { createMemo, Show, For } from "solid-js"

// 4-tier color buckets for trend bars.
function sparkColor(api: TuiPluginApi, rate: number) {
  const theme = api.theme.current
  if (rate >= 75) return theme.success ?? theme.text ?? undefined
  if (rate >= 50) return theme.text ?? undefined
  if (rate >= 25) return theme.warning ?? theme.text ?? undefined
  return theme.error ?? theme.warning ?? theme.textMuted ?? undefined
}

function hitColor(api: TuiPluginApi, rate: number | null) {
  const theme = api.theme.current
  if (rate === null) return theme.textMuted ?? undefined
  if (rate >= 50) return theme.success ?? theme.text ?? undefined
  return theme.textMuted ?? theme.text ?? undefined
}

const id = "internal:sidebar-context"

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
})

function View(props: { api: TuiPluginApi; session_id: string }) {
  const theme = () => props.api.theme.current
  const msg = createMemo(() => props.api.state.session.messages(props.session_id))
  const session = createMemo(() => props.api.state.session.get(props.session_id))
  const cost = createMemo(() => session()?.cost ?? 0)

  const stats = createMemo(() => {
    const list = msg().filter(
      (m): m is AssistantMessage => m.role === "assistant" && m.tokens.output > 0,
    )

    if (list.length === 0) {
      return {
        tokens: 0,
        percent: null,
        cumRead: 0,
        cumWrite: 0,
        cumInput: 0,
        lastRead: 0,
        lastWrite: 0,
        lastInput: 0,
        lastHit: null as number | null,
        cumHit: null as number | null,
        history: [] as number[],
      }
    }

    const last = list[list.length - 1]!

    let cumRead = 0
    let cumWrite = 0
    let cumInput = 0
    const history: number[] = []
    for (const m of list) {
      cumRead += m.tokens.cache.read
      cumWrite += m.tokens.cache.write
      cumInput += m.tokens.input
      const inputTotal = m.tokens.input + m.tokens.cache.read
      history.push(inputTotal > 0 ? Math.round((m.tokens.cache.read / inputTotal) * 100) : 0)
    }

    const model = props.api.state.provider.find(
      (item) => item.id === last.providerID,
    )?.models[last.modelID]
    const tokens =
      last.tokens.input +
      last.tokens.output +
      last.tokens.reasoning +
      last.tokens.cache.read +
      last.tokens.cache.write
    const lastInputTotal = last.tokens.input + last.tokens.cache.read
    const lastHit = lastInputTotal > 0 ? Math.round((last.tokens.cache.read / lastInputTotal) * 100) : null
    const cumInputTotal = cumInput + cumRead
    const cumHit = cumInputTotal > 0 ? Math.round((cumRead / cumInputTotal) * 100) : null

    return {
      tokens,
      percent: model?.limit.context ? Math.round((tokens / model.limit.context) * 100) : null,
      cumRead,
      cumWrite,
      cumInput,
      lastRead: last.tokens.cache.read,
      lastWrite: last.tokens.cache.write,
      lastInput: last.tokens.input,
      lastHit,
      cumHit,
      history,
    }
  })

  return (
    <box>
      <text fg={theme().text}>
        <b>Context</b>
      </text>
      <text fg={theme().textMuted}>{stats().tokens.toLocaleString()} tokens</text>
      <text fg={theme().textMuted}>{stats().percent ?? 0}% used</text>
      <text fg={theme().textMuted}>{money.format(cost())} spent</text>
      <text fg={hitColor(props.api, stats().cumHit)}>
        hit (cum): {stats().cumHit !== null ? `${stats().cumHit}%` : "-"}
      </text>
      <text fg={hitColor(props.api, stats().lastHit)}>
        hit (last): {stats().lastHit !== null ? `${stats().lastHit}%` : "-"}
      </text>
      <text fg={theme().textMuted}>
        r/w: {stats().cumRead.toLocaleString()}/{stats().cumWrite.toLocaleString()} (last {stats().lastRead.toLocaleString()}/{stats().lastWrite.toLocaleString()})
      </text>
      <Show when={stats().history.length > 0}>
        <box flexDirection="row" gap={0}>
          <text fg={theme().textMuted}>trend: </text>
          <For each={stats().history.slice(-20)}>
            {(rate) => <text fg={sparkColor(props.api, rate)}>█</text>}
          </For>
        </box>
        <text fg={theme().textMuted}>
          min {Math.min(...stats().history)} / max {Math.max(...stats().history)} / last {stats().lastHit ?? "-"}%
        </text>
      </Show>
    </box>
  )
}

const tui: TuiPlugin = async (api) => {
  api.slots.register({
    order: 100,
    slots: {
      sidebar_content(_ctx, props) {
        return <View api={api} session_id={props.session_id} />
      },
    },
  })
}

const plugin: BuiltinTuiPlugin = {
  id,
  tui,
}

export default plugin
