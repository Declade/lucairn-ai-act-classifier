# Accuracy report — @lucairn/ai-act-classifier (LLM Groq mode)

LLM mode skipped — GROQ_API_KEY env var not set.

To regenerate this report:

```bash
GROQ_API_KEY="<your-key>" pnpm accuracy:llm-groq
```

The LLM-mode harness costs approximately $0.005 per run on Llama 3.3 70B
across the 50-case bilingual fixture corpus. LLM-mode accuracy is an opt-in
observation — it is NOT a CI-blocking metric. The deterministic-mode CI floor
(overall ≥80%, Art 5 100%) remains the only enforced gate.

See [README.md §--llm mode (opt-in)](../README.md) for setup.
