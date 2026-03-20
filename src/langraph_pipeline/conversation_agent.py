"""
LangGraph Conversational Agent for Auto-GIT

A true conversational agent that:
1. Chats with the user to understand requirements
2. Asks clarifying questions
3. Builds context over multiple turns
4. Extracts structured requirements
5. Only then executes the pipeline
"""

import logging
from typing import TypedDict, Annotated, Literal
from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver
from langchain_ollama import ChatOllama
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage
import operator

logger = logging.getLogger(__name__)


# ============================================
# Conversation State
# ============================================

class ConversationState(TypedDict):
    """State for the conversational agent"""
    # Conversation history
    messages: Annotated[list, operator.add]
    
    # Extracted information
    user_idea: str
    clarified: bool
    requirements: dict
    
    # Agent decision
    next_action: str  # "ask_more", "ready", "execute"
    
    # Execution readiness
    ready_for_pipeline: bool
    confidence_score: float


# ============================================
# Conversational Agent Node
# ============================================

async def conversation_agent_node(state: ConversationState) -> dict:
    """
    Main conversational agent that understands user intent
    
    This agent:
    - Understands natural language
    - Asks clarifying questions
    - Extracts requirements
    - Decides when ready to execute
    """
    
    llm = ChatOllama(
        model="gemma2:2b",  # Faster model for quick conversations
        temperature=0.3,  # Lower temp for focused responses
        base_url="http://localhost:11434",
        num_predict=150  # Limit response length for speed
    )
    
    messages = state.get("messages", [])
    
    # Natural, efficient system prompt
    system_prompt = """You're an AI assistant for Auto-GIT. Help users build projects quickly.

**Core Rules:**
1. **Stay On Topic** - Remember what the user asked for in the FIRST message
2. **Be Direct** - If user says "proceed", "build", "yes", "go" → start immediately
3. **One Quick Check** - Ask 1-2 clarifying questions MAXIMUM, then execute
4. **No Explanations** - Don't explain concepts, just clarify requirements

**Response Format:**
[Brief, direct message addressing their request]
[DECISION: ready/ask_more] [CONFIDENCE: 0.0-1.0]

**Example - Correct:**
User: "generate a transformer attention mechanism"
You: "Building transformer attention mechanism. Include multi-head attention? Positional encoding?
[DECISION: ask_more] [CONFIDENCE: 0.7]"

User: "yes both"
You: "Perfect! Generating transformer with multi-head attention + positional encoding now.
[DECISION: ready] [CONFIDENCE: 1.0]"

**Example - Wrong (Don't do this):**
User: "generate transformer"
You: "Let me explain what transformers are..." ❌ NO! Just ask what they need and build it.

Stay focused. Be decisive. Remember the original request!"""

    # Add system message
    conversation_messages = [SystemMessage(content=system_prompt)]
    
    # Add conversation history
    conversation_messages.extend(messages)
    
    # Get response from LLM
    response = await llm.ainvoke(conversation_messages)
    ai_message = response.content
    
    # Parse decision from response
    decision = "ask_more"
    confidence = 0.5
    
    if "[DECISION: ready]" in ai_message:
        decision = "ready"
    elif "[DECISION: ask_more]" in ai_message:
        decision = "ask_more"
    
    # Extract confidence
    if "[CONFIDENCE:" in ai_message:
        try:
            conf_str = ai_message.split("[CONFIDENCE:")[1].split("]")[0].strip()
            confidence = float(conf_str)
        except:
            confidence = 0.5
    
    # Clean response (remove hidden tags)
    clean_response = ai_message.replace("[DECISION: ready]", "").replace("[DECISION: ask_more]", "")
    clean_response = clean_response.split("[CONFIDENCE:")[0].strip()
    
    return {
        "messages": [AIMessage(content=clean_response)],
        "next_action": decision,
        "confidence_score": confidence,
        "ready_for_pipeline": decision == "ready" and confidence >= 0.7
    }


# ============================================
# Requirements Extractor Node
# ============================================

def extract_requirements_node(state: ConversationState) -> dict:
    """
    Extract structured requirements - ACCURATE extraction from conversation
    Uses pattern matching to extract what user ACTUALLY said
    """
    
    messages = state.get("messages", [])
    
    # Get ONLY user messages (not agent responses)
    user_messages = [m.content for m in messages if isinstance(m, HumanMessage)]
    user_text = " ".join(user_messages)
    user_lower = user_text.lower()
    
    # Get full conversation for context
    conversation_text = " ".join([m.content for m in messages if isinstance(m, (HumanMessage, AIMessage))])
    conversation_lower = conversation_text.lower()
    
    import re
    
    # Build core idea from user's FIRST message (most important)
    core_idea = user_messages[0] if user_messages else "Research and code generation"
    
    # Detect approach
    approach = "from-scratch"
    if "fine-tune" in user_lower or "finetune" in user_lower or "fine tune" in user_lower:
        approach = "fine-tune"
    
    # Detect model with better patterns
    model_type = "transformer"
    model_patterns = [
        (r"gemma\s*3?\s*270m?", "Gemma 270M"),
        (r"gemma\s*\d*b?", "Gemma"),
        (r"llama\s*\d+", "Llama"),
        (r"qwen\s*\d+", "Qwen"),
        (r"mistral", "Mistral"),
        (r"gpt", "GPT"),
        (r"bert", "BERT")
    ]
    for pattern, name in model_patterns:
        if re.search(pattern, user_lower):
            model_type = name
            break
    
    # Detect target task from user's words
    target_task = "Code generation"
    if "code review" in user_lower:
        target_task = "Code review with LLM"
    elif "bug detection" in user_lower or "bug finder" in user_lower or "find bugs" in user_lower:
        target_task = "Bug detection in code"
    elif "style check" in user_lower or "code style" in user_lower:
        target_task = "Code style checking"
    elif "security" in user_lower:
        target_task = "Security analysis"
    
    # Build detailed requirements
    requirements = {
        "core_idea": core_idea,
        "approach": approach,
        "model_type": model_type,
        "target_task": target_task,
        "constraints": [],
        "search_papers": True,
        "generate_code": True,
        "publish_github": False
    }
    
    return {
        "requirements": requirements,
        "user_idea": core_idea,
        "clarified": True,
        "ready_for_pipeline": True
    }


# ============================================
# Router Function
# ============================================

def route_conversation(state: ConversationState) -> Literal["continue", "extract", "end"]:
    """
    Route based on conversation state
    
    Returns:
        "continue": Keep conversing
        "extract": Extract requirements and prepare for execution
        "end": User wants to quit
    """
    
    next_action = state.get("next_action", "ask_more")
    messages = state.get("messages", [])
    confidence = state.get("confidence_score", 0.0)
    
    # Check if user wants to exit
    if messages:
        last_message = messages[-1]
        if isinstance(last_message, HumanMessage):
            content = last_message.content.lower()
            if any(word in content for word in ["exit", "quit", "cancel", "stop", "nevermind"]):
                return "end"
            
            # Detect strong ready signals from user
            ready_signals = ["yes", "let's go", "ready", "proceed", "dive in", "go ahead", 
                           "start", "begin", "do it", "sure", "ok", "okay"]
            if any(signal in content for signal in ready_signals) and confidence > 0.6:
                return "extract"
    
    # Route based on agent's decision
    if next_action == "ready":
        return "extract"
    else:
        return "continue"


# ============================================
# Build Conversation Graph
# ============================================

def build_conversation_graph() -> StateGraph:
    """
    Build the conversation graph with LangGraph
    
    Flow (single turn per invocation):
    1. User input → Conversation Agent
    2. Agent responds and decides: ask_more or ready
    3. If ready: extract requirements
    4. Return to CLI (CLI handles the loop)
    """
    
    workflow = StateGraph(ConversationState)
    
    # Add nodes
    workflow.add_node("agent", conversation_agent_node)
    workflow.add_node("extract", extract_requirements_node)
    
    # Entry point
    workflow.set_entry_point("agent")
    
    # Conditional routing (single turn - no loops)
    workflow.add_conditional_edges(
        "agent",
        route_conversation,
        {
            "continue": END,  # Return to CLI for next user input
            "extract": "extract",  # Extract requirements if ready
            "end": END
        }
    )
    
    # After extraction, end (caller will execute pipeline)
    workflow.add_edge("extract", END)
    
    return workflow


def compile_conversation_graph():
    """Compile with memory"""
    workflow = build_conversation_graph()
    memory = MemorySaver()
    return workflow.compile(checkpointer=memory)


# ============================================
# High-Level Conversation Function
# ============================================

async def have_conversation(user_message: str, thread_id: str = "default") -> dict:
    """
    Have a single turn of conversation
    
    Args:
        user_message: User's message
        thread_id: Thread ID for conversation memory
        
    Returns:
        dict with:
            - agent_response: What the agent said
            - ready_for_pipeline: bool
            - requirements: dict (if ready)
    """
    
    workflow = compile_conversation_graph()
    
    # Create state
    state = {
        "messages": [HumanMessage(content=user_message)],
        "user_idea": "",
        "clarified": False,
        "requirements": {},
        "next_action": "ask_more",
        "ready_for_pipeline": False,
        "confidence_score": 0.0
    }
    
    config = {
        "configurable": {
            "thread_id": thread_id
        }
    }
    
    # Run conversation
    final_state = None
    async for s in workflow.astream(state, config):
        for node_name, node_state in s.items():
            final_state = node_state
    
    # Extract response
    messages = final_state.get("messages", [])
    agent_response = ""
    if messages:
        last_ai_message = [m for m in messages if isinstance(m, AIMessage)]
        if last_ai_message:
            agent_response = last_ai_message[-1].content
    
    return {
        "agent_response": agent_response,
        "ready_for_pipeline": final_state.get("ready_for_pipeline", False),
        "requirements": final_state.get("requirements", {}),
        "confidence": final_state.get("confidence_score", 0.0),
        "clarified": final_state.get("clarified", False)
    }
