# Paste this at the top of your app.py (replace the single smolagents import line):
#
# REPLACE THIS:
#   from smolagents import CodeAgent, DuckDuckGoSearchTool, InferenceClientModel, load_tool, tool
#
# WITH THIS:

from smolagents import CodeAgent, load_tool, tool

try:
    from smolagents import InferenceClientModel
except ImportError:
    try:
        from smolagents.models import InferenceClientModel
    except ImportError:
        raise ImportError(
            "InferenceClientModel not found. Run: pip install -U smolagents"
        ) from None

# Optional: if you use DuckDuckGoSearchTool, add:
# from smolagents import DuckDuckGoSearchTool
