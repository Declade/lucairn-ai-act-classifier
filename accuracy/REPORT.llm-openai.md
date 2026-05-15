# Accuracy report — @lucairn/ai-act-classifier (LLM OpenAI mode)

LLM mode skipped — OPENAI_API_KEY env var not set.

To regenerate this report:

```bash
OPENAI_API_KEY="<your-key>" pnpm accuracy:llm-openai
```

The LLM-mode harness costs approximately $0.025 per run on GPT-4o-mini
across the 50-case bilingual fixture corpus. LLM-mode accuracy is an opt-in
observation — it is NOT a CI-blocking metric. The deterministic-mode CI floor
(overall ≥80%, Art 5 100%) remains the only enforced gate.

See [README.md §--llm mode (opt-in)](../README.md) for setup.
