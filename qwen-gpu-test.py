import torch
from transformers import AutoTokenizer, AutoModelForCausalLM

MODEL_NAME = "Qwen/Qwen2.5-Coder-7B-Instruct"

print("=" * 70)
print("QWEN2.5-CODER-7B-INSTRUCT - PROMPT TEST")
print("=" * 70)

print("PyTorch:", torch.__version__)
print("CUDA:", torch.cuda.is_available())
print("GPU count:", torch.cuda.device_count())

for i in range(torch.cuda.device_count()):
    gpu = torch.cuda.get_device_properties(i)
    print(
        f"GPU {i}: {torch.cuda.get_device_name(i)} | "
        f"VRAM: {gpu.total_memory / 1024**3:.2f} GB"
    )

print("\nLoading tokenizer...")
tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)

print("Loading model...")
model = AutoModelForCausalLM.from_pretrained(
    MODEL_NAME,
    torch_dtype=torch.float16,
    device_map="auto"
)

print("Model loaded successfully.")

# ============================================================
# PROMPT
# ============================================================

prompt = """SYSTEM:
Act as an expert software developer.
Take requests for changes to the supplied code.
If the request is ambiguous, ask questions.

Once you understand the request you MUST:
1. Determine if any code changes are needed.
2. Explain any needed changes.
3. If changes are needed, output a copy of each file that needs changes.

To suggest changes to a file you MUST return the entire content of the updated file.
You MUST use this *file listing* format:

path/to/filename.js
```
// entire file content ...
// ... goes in between
```

Every *file listing* MUST use this format:
- First line: the filename with any originally provided path; no extra markup, punctuation, comments, etc. **JUST** the filename with path.
- Second line: opening ```
- ... entire content of the file ...
- Final line: closing ```

To suggest changes to a file you MUST return a *file listing* that contains the entire content of the file.
*NEVER* skip, omit or elide content from a *file listing* using "..." or by adding comments like "... rest of code..."!
Create a new file you MUST return a *file listing* which includes an appropriate filename, including any appropriate path.




USER:
Change the greeting to be more casual

ASSISTANT:
Ok, I will:

1. Switch the greeting text from "Hello" to "Hey".

show_greeting.py
```
import sys

def greeting(name):
    print(f"Hey {name}")

if __name__ == '__main__':
    greeting(sys.argv[1])
```


USER:
I switched to a new code base. Please don't consider the above files or try to edit them any longer.

ASSISTANT:
Ok.

USER:
Here are summaries of some files present in my git repository.
Do not propose changes to these files, treat them as *read-only*.
If you need to edit any of these files, ask me to *add them to the chat* first.

hello.py:
⋮
│def hello(name):
⋮
│def get_weather(city):
⋮

qwen_ollama_bridge.py:
⋮
│def run_qwen(prompt):
⋮
│def messages_to_prompt(messages, tools=None):
⋮
│def extract_tool_call(text):
⋮
│def execute_tool(tool_call):
│
⋮
│def ollama_chat_response(messages, tools=None):
│
⋮
│@app.get("/")
│def index():
│
⋮
│@app.get("/api/version")
│def version():
│
⋮
│@app.get("/api/tags")
│def tags():
│
⋮
│@app.post("/api/show")
│def show():
│
⋮
│@app.post("/api/generate")
│def generate():
│
│    data = request.get_json(force=True)
│
⋮
│    try:
│
│        response = run_qwen(prompt)
│
│        if data.get("stream", False):
│
│            def generate_stream():
│
│                yield json.dumps({
│                    "model": MODEL_NAME,
│                    "created_at": "",
│                    "response": "",
│                    "done": False
│                }, ensure_ascii=False) + "\n"
│
│                chunk_size = 80
│
⋮
│@app.post("/api/chat")
│def chat():
│
│    data = request.get_json(force=True)
│
⋮
│    try:
│
│        result = ollama_chat_response(
│            messages,
│            tools
⋮
│        if data.get("stream", False):
│
│            def chat_stream():
│
│                if tool_calls:
│
│                    yield json.dumps({
│                        "model": MODEL_NAME,
│                        "created_at": "",
│                        "message": {
│                            "role": "assistant",
│                            "content": "",
⋮
│@app.get("/v1/models")
│def openai_models():
│
⋮
│@app.post("/v1/chat/completions")
│def openai_chat_completions():
│
│    data = request.get_json(force=True)
│
⋮
│    try:
│
│        prompt = messages_to_prompt(
│            messages,
│            tools
⋮
│        if data.get("stream", False):
│
│            def openai_stream():
│
│                if tool_call:
│
│                    chunk = {
│                        "id": "chatcmpl-qwen-1",
│                        "object": "chat.completion.chunk",
│                        "created": int(time.time()),
│                        "model": model,
│                        "choices": [
⋮

weather_check.py

weather_test.py:
⋮
│def get_weather(city):
⋮


ASSISTANT:
Ok, I won't try and edit those files without asking first.

USER:
Don't try and edit any existing code without asking me to add the files to the chat!
Tell me which files in my repo are the most likely to **need changes** to solve the requests I make, and then stop so I can add them to the chat.
Only include the files that are most likely to actually need to be edited.
Don't include files that might contain relevant context, just files that will need to be changed.


ASSISTANT:
Ok, based on your requests I will suggest which files need to be edited and then stop and wait for your approval.

USER:
اقرأ nexora_bot.py فقط. لا تعدّل أي ملف، ولا تنشئ diff، ولا تنشئ commit. أجب بكلمة واحدة فقط: NEXORA_READ_OK

To suggest changes to a file you MUST return the entire content of the updated file.
You MUST use this *file listing* format:

path/to/filename.js
```
// entire file content ...
// ... goes in between
```

Every *file listing* MUST use this format:
- First line: the filename with any originally provided path; no extra markup, punctuation, comments, etc. **JUST** the filename with path.
- Second line: opening ```
- ... entire content of the file ...
- Final line: closing ```

To suggest changes to a file you MUST return a *file listing* that contains the entire content of the file.
*NEVER* skip, omit or elide content from a *file listing* using "..." or by adding comments like "... rest of code..."!
Create a new file you MUST return a *file listing* which includes an appropriate filename, including any appropriate path.




ASSISTANT:"""

print("\n" + "=" * 70)
print("PROMPT:")
print("=" * 70)
print(prompt)

messages = [
    {
        "role": "system",
        "content": "You are an expert Python programmer."
    },
    {
        "role": "user",
        "content": prompt
    }
]

text = tokenizer.apply_chat_template(
    messages,
    tokenize=False,
    add_generation_prompt=True
)

inputs = tokenizer(
    text,
    return_tensors="pt"
)

# Put inputs on the device used by the model.
inputs = {
    key: value.to(model.device)
    for key, value in inputs.items()
}

print("\nGenerating response...")

with torch.no_grad():
    outputs = model.generate(
        **inputs,
        max_new_tokens=300,
        do_sample=False
    )

result = tokenizer.decode(
    outputs[0][inputs["input_ids"].shape[1]:],
    skip_special_tokens=True
)

print("\n" + "=" * 70)
print("QWEN RESPONSE:")
print("=" * 70)
print(result)
print("=" * 70)

print("\nGeneration test: COMPLETE")

print("\nGPU MEMORY:")
for i in range(torch.cuda.device_count()):
    allocated = torch.cuda.memory_allocated(i) / 1024**3
    reserved = torch.cuda.memory_reserved(i) / 1024**3
    peak = torch.cuda.max_memory_allocated(i) / 1024**3

    print(f"GPU {i}:")
    print(f"  Allocated: {allocated:.2f} GB")
    print(f"  Reserved:  {reserved:.2f} GB")
    print(f"  Peak:      {peak:.2f} GB")

print("\nModel device map:")
devices = sorted(
    set(str(device) for device in model.hf_device_map.values())
)

print("Devices used by model:", devices)

print("\n" + "=" * 70)
print("TEST COMPLETE")
print("=" * 70)
