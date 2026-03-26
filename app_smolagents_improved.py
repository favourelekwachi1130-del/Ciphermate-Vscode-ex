"""
Smolagents CodeAgent + Gradio UI

- Runs a code-capable LLM (default: Qwen2.5-Coder via Hugging Face Inference Providers).
- Tools: final_answer (registered automatically), timezone lookup, optional Hub image tool.
- Optional overrides: prompts.yaml in the working directory (same shape as smolagents code_agent templates).
- Requires HF_TOKEN for InferenceClientModel; UI needs: pip install 'smolagents[gradio]'
"""

import datetime
from pathlib import Path
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import yaml
from smolagents import CodeAgent, load_tool, tool

# InferenceClientModel: in newer smolagents it's in __init__, in older versions only in .models
try:
    from smolagents import InferenceClientModel
except ImportError:
    try:
        from smolagents.models import InferenceClientModel
    except ImportError:
        raise ImportError(
            "InferenceClientModel not found. Upgrade smolagents: pip install -U smolagents"
        ) from None

# Shipped with smolagents (Gradio is optional — install smolagents[gradio])
try:
    from smolagents import GradioUI
except ImportError:
    GradioUI = None  # type: ignore[misc, assignment]


# ---- Tools (register these with the agent) ----

@tool
def get_current_time_in_timezone(timezone: str) -> str:
    """Get the current local time in a given timezone.
    Args:
        timezone: IANA timezone name (e.g. 'America/New_York', 'Europe/London').
    """
    try:
        tz = ZoneInfo(timezone)
        local_time = datetime.datetime.now(tz).strftime("%Y-%m-%d %H:%M:%S")
        return f"The current local time in {timezone} is: {local_time}"
    except (ZoneInfoNotFoundError, ValueError) as e:
        return f"Error: invalid timezone '{timezone}' ({e})"


@tool
def my_custom_tool(arg1: str, arg2: int) -> str:
    """Example custom tool — extend with your own logic.
    Args:
        arg1: First argument (string).
        arg2: Second argument (integer).
    """
    # Replace with real logic (e.g. API call, computation)
    return f"Processed: arg1={arg1!r}, arg2={arg2}"


def load_prompt_templates(path: str = "prompts.yaml") -> dict | None:
    """Load system prompt / templates from YAML."""
    p = Path(path)
    if not p.exists():
        return None
    with open(p, "r") as f:
        return yaml.safe_load(f)


def create_model(
    model_id: str = "Qwen/Qwen2.5-Coder-32B-Instruct",
    max_tokens: int = 2096,
    temperature: float = 0.5,
):
    """Create the inference model for the agent."""
    return InferenceClientModel(
        model_id=model_id,
        max_tokens=max_tokens,
        temperature=temperature,
        custom_role_conversions=None,
    )


def create_agent(
    model=None,
    tools=None,
    prompt_templates=None,
    max_steps: int = 6,
    use_image_tool: bool = False,
):
    """Build CodeAgent with model, tools, and optional prompt templates."""
    if model is None:
        model = create_model()
    if tools is None:
        tools = []

    # CodeAgent / MultiStepAgent always registers final_answer via setdefault — no need to pass it twice
    agent_tools = [get_current_time_in_timezone, my_custom_tool]

    # Optional: image generation from Hub
    if use_image_tool:
        try:
            image_tool = load_tool("agents-course/text-to-image", trust_remote_code=True)
            agent_tools.append(image_tool)
        except Exception as e:
            print(f"Image tool not loaded: {e}")

    # Any extra tools passed in
    agent_tools.extend(tools)

    if prompt_templates is None:
        prompt_templates = load_prompt_templates()

    return CodeAgent(
        model=model,
        tools=agent_tools,
        max_steps=max_steps,
        verbosity_level=1,
        planning_interval=None,
        prompt_templates=prompt_templates,
    )


def main():
    if GradioUI is None:
        raise SystemExit(
            "Gradio is not installed. Run: pip install 'smolagents[gradio]'"
        )
    # Hugging Face Inference Providers: set HF_TOKEN (see InferenceClientModel docs)
    prompt_templates = load_prompt_templates()
    model = create_model()
    agent = create_agent(
        model=model,
        prompt_templates=prompt_templates,
        max_steps=6,
        use_image_tool=False,  # set True to enable image generation
    )
    GradioUI(agent).launch()


if __name__ == "__main__":
    main()
