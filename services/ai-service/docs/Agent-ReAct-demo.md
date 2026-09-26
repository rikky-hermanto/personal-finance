The academic foundation of modern code agents comes from a landmark 2022 research paper out of Princeton University and Google Research called ReAct: Synergizing Reasoning and Acting in Language Models. Shortly after, [Harrison Chase](https://www.google.com/search?q=harrison+chase&kgmid=/g/11gd308g2x) codified this exact paper into the first mainstream open-source agent framework: [LangChain](https://www.langchain.com/blog/three-years-langchain). [1, 2, 3, 4, 5] 
Rather than relying on high-level frameworks that obscure what is happening, this step-by-step tutorial builds a production-grade ReAct agent loop from scratch using pure Python, exactly how the original inventors designed it.
------------------------------
## Step 1: Define the Brain and the System Prompt
The core of a ReAct agent is a specific prompt format: Thought → Action → Observation. You instruct the model to state its reasoning (Thought), output an explicit system call (Action), wait for your code to execute it, and look at the result (Observation). [6, 7] 

import osimport refrom openai import OpenAI  # Works for Claude/Ollama similarly
client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))
SYSTEM_PROMPT = """
You are a database and research assistant agent. You run in a loop of Thought, Action, Observation.
At the end of the loop you output an Answer.

Use Thought to describe your thoughts about the question.
Use Action to run one of the actions available to you - then return to the loop.
Use Observation to look at the result of that action.

Your available actions are:

1. calculate:
e.g. calculate: 4 * 7
Runs a python mathematical execution.

2. query_inventory:
e.g. query_inventory: "widget_id_123"
Looks up the current warehouse stock levels for a specific item ID.

Example session:

Question: Do we have enough stock of item widget_99 to fulfill an order of 50 units?
Thought: I need to check the inventory levels for widget_99 first.
Action: query_inventory: "widget_99"
Observation: {"stock": 120}
Thought: The inventory shows 120 units, which is greater than the 50 requested.
Answer: Yes, we have 120 units of widget_99 in stock, which is enough to fulfill the order of 50."""

------------------------------
## Step 2: Write the Hardcoded Tools
These are standard, deterministic programming hooks. The agent has no idea how they work; it only knows how to call them.

import json
def calculate(expression: str) -> str:
    # A simple math evaluator tool
    try:
        return str(eval(expression))
    except Exception as e:
        return f"Error executing math: {str(e)}"
def query_inventory(item_id: str) -> str:
    # A mocked database lookup
    database = {
        "sku_100": {"stock": 14, "location": "Aisle 3"},
        "sku_200": {"stock": 85, "location": "Aisle 9"},
    }
    clean_id = item_id.strip('"\' ')
    result = database.get(clean_id, {"error": "Item not found"})
    return json.dumps(result)
# Map string names to the functional execution blocksKNOWN_TOOLS = {
    "calculate": calculate,
    "query_inventory": query_inventory
}

------------------------------
## Step 3: Write the Orchestration Loop
This is the "Harness" or the actual Agent runtime. It manages the conversation state history, parses out the exact action string the LLM asks for, runs the corresponding python tool, and feeds the string response back to the LLM. [7, 8, 9, 10, 11] 

def run_agent_task(user_question: str, max_turns: int = 5):
    # Initialize the agent memory with the prompt context
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": user_question}
    ]
    
    # The Core Agent Execution Loop
    for turn in range(max_turns):
        print(f"\n--- [AGENT TURN {turn + 1}] ---")
        
        # Call the LLM
        response = client.chat.completions.create(
            model="gpt-4o",  # Or claude-3-5-sonnet
            messages=messages
        )
        
        llm_output = response.choices[0].message.content
        print(llm_output)
        
        # Append the agent's thoughts and actions into memory
        messages.append({"role": "assistant", "content": llm_output})
        
        # Check if the agent has arrived at the final answer
        if "Answer:" in llm_output:
            return llm_output
            
        # Parse for an action matching "Action: tool_name: arguments"
        action_match = re.search(r"Action:\s*(\w+):\s*(.*)", llm_output)
        
        if action_match:
            tool_name = action_match.group(1)
            tool_args = action_match.group(2)
            
            if tool_name in KNOWN_TOOLS:
                print(f"Executing tool {tool_name} with args: {tool_args}")
                # 1. RUN THE TOOL
                observation_result = KNOWN_TOOLS[tool_name](tool_args)
                print(f"Observation: {observation_result}")
                
                # 2. FEED OBSERVATION BACK TO AGENT
                messages.append({
                    "role": "user", 
                    "content": f"Observation: {observation_result}"
                })
            else:
                messages.append({
                    "role": "user", 
                    "content": f"Observation: Error - Tool '{tool_name}' does not exist."
                })
        else:
            # If the LLM didn't format an Action or Answer properly, force it to correct
            messages.append({
                "role": "user", 
                "content": "Observation: You did not provide an Action or an Answer. Please proceed."
            })
            
    return "Agent failed to resolve task within maximum allocation bounds."

------------------------------
## Step 4: Execute the Task headless
When you invoke this task, the code runs completely autonomously without any human input. [12] 

if __name__ == "__main__":
    question = "If an order requires 3 items of sku_100 and 5 items of sku_200, do we have enough combined total stock?"
    final_output = run_agent_task(question)
    print("\n================== FINAL RESULT ==================")
    print(final_output)

## What happens under the hood during execution:

   1. Turn 1: The LLM outputs Thought: I need to query the stock for sku_100 and sku_200. and fires Action: query_inventory: "sku_100".
   2. Loop Interrupt: Python pauses the LLM, intercepts the text query_inventory: "sku_100", runs your local query_inventory function, gets {"stock": 14}, adds it to the prompt array, and restarts the LLM.
   3. Turn 2: The LLM reads the result, processes it, and fires Action: query_inventory: "sku_200". Python executes it and feeds back {"stock": 85}.
   4. Turn 3: The LLM acts on the new data, recognizes it needs to compute a total, and calls Action: calculate: 14 + 85. Python runs eval("14 + 85") and hands back 99.
   5. Turn 4: The LLM sees the observation 99 and realizes the objective has been reached. It prints Answer: Yes, the combined total stock is 99 units... and the loop terminates. [7, 11] 

Would you like to see how to implement self-healing error handling (what happens when the tool throws a Python exception and the agent has to read the stack trace to fix its input) or explore how this maps to multi-agent state machines like LangGraph?

[1] https://react-lm.github.io
[2] [https://verifywise.ai](https://verifywise.ai/ai-governance-library/agentic-foundations/agent-react-paper-2023)
[3] [https://sequoiacap.com](https://sequoiacap.com/article/langchain-from-agent-0-to-1-to-agentic-engineering)
[4] [https://x.com](https://x.com/hwchase17/status/1595456660507459585)
[5] [https://www.langchain.com](https://www.langchain.com/blog/three-years-langchain)
[6] [https://arxiv.org](https://arxiv.org/html/2609.20804v1)
[7] [https://aclanthology.org](https://aclanthology.org/2025.iwsds-1.12.pdf)
[8] [https://www.youtube.com](https://www.youtube.com/watch?v=ZUjijNrg5sQ)
[9] [https://www.youtube.com](https://www.youtube.com/watch?v=rSKh6bVuVZI)
[10] [https://www.youtube.com](https://www.youtube.com/watch?v=eA9Zf2-qYYM)
[11] [https://www.youtube.com](https://www.youtube.com/watch?v=c9AnqCeyxbI)
[12] [https://www.youtube.com](https://www.youtube.com/watch?v=gHB4JFG9i3k&t=672)
