# Personalized_Plan/services/Plan_Adjuster.py

import json
import os
import re
import logging
from datetime import datetime
from urllib import request

Logger = logging.getLogger(__name__)

def _build_adjust_prompt(current_plan, instruction, selected_period_index):
    """Build prompt for plan adjustment"""
    
    if isinstance(current_plan, str):
        try:
            current_plan = json.loads(current_plan)
        except:
            raise ValueError("Current_Plan must be a valid JSON string or dict")
    
    # Get current period tasks
    plan_list = current_plan.get("plan", [])
    current_tasks = []
    if selected_period_index < len(plan_list):
        period = plan_list[selected_period_index]
        for day in period.get("days", []):
            for task in day.get("tasks", []):
                current_tasks.append({
                    "task_id": task.get("task_id", ""),
                    "title": task.get("title", ""),
                    "type": task.get("type", "")
                })
    
    return f"""You are a CEFR-aligned English writing tutor. Return ONLY valid JSON.

User instruction: "{instruction}"

Current plan level: {current_plan.get('cefr_level', 'A1')}
Focus skills: {current_plan.get('focus_skills', [])}

Current tasks in selected period (index {selected_period_index}):
{json.dumps(current_tasks[:5], indent=2)}

For instruction "{instruction}", modify the plan by:
- ADDING a new task to the selected period (first day)
- Keep ALL existing tasks unchanged

Task template:
{{
  "task_id": "new_task_1",
  "title": "New Writing Task",
  "prompt": "Write a paragraph about...",
  "type": "writing_task",
  "estimated_minutes": 30,
  "skills": ["writing", "grammar"],
  "status": "todo",
  "materials": [
    {{"title": "Writing Guide", "url": "https://owl.purdue.edu/owl/general_writing/academic_writing/index.html", "source": "Purdue OWL"}}
  ]
}}

Return the COMPLETE updated plan JSON.
DO NOT remove existing tasks.
DO NOT add extra text outside JSON.

Return ONLY the JSON object, starting with '{{' and ending with '}}'."""

def _call_openrouter(prompt):
    """Call OpenRouter API"""
    base_url = os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")
    api_key = os.getenv("OPENROUTER_API_KEY")
    model = os.getenv("OPENROUTER_MODEL", "google/gemini-2.5-flash")
    referer = os.getenv("OPENROUTER_HTTP_REFERER", "http://localhost:8000")
    app_name = os.getenv("OPENROUTER_APP_NAME", "EWC-AI-Backend")

    if not api_key:
        raise ValueError("OPENROUTER_API_KEY environment variable is required")

    body = {
        "model": model,
        "messages": [
            {"role": "system", "content": "You are a JSON generator. Return ONLY valid JSON. No markdown, no explanations, no extra text."},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.2,
        "max_tokens": 1500,
    }

    req = request.Request(
        url=f"{base_url}/chat/completions",
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": referer,
            "X-Title": app_name,
        },
        method="POST",
    )

    with request.urlopen(req, timeout=60) as resp:
        payload = json.loads(resp.read().decode("utf-8"))
    
    content = payload["choices"][0]["message"]["content"]
    Logger.info(f"OpenRouter response received, length: {len(content)}")
    return content

def _extract_json_from_response(text):
    """Extract JSON object from response"""
    if not text:
        return None
    
    # Remove markdown code blocks
    text = re.sub(r'```json\s*', '', text)
    text = re.sub(r'```\s*', '', text)
    
    # Find JSON object boundaries
    start_idx = text.find('{')
    end_idx = text.rfind('}')
    
    if start_idx == -1 or end_idx == -1 or end_idx <= start_idx:
        return None
    
    json_candidate = text[start_idx:end_idx + 1]
    
    # Clean up
    json_candidate = json_candidate.replace("'", '"')
    json_candidate = re.sub(r',\s*}', '}', json_candidate)
    json_candidate = re.sub(r',\s*]', ']', json_candidate)
    
    return json_candidate

def _safe_json(text):
    """Parse JSON safely"""
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        extracted = _extract_json_from_response(text)
        if extracted:
            try:
                return json.loads(extracted)
            except json.JSONDecodeError:
                pass
        raise ValueError("Plan adjuster did not return valid JSON")

def _add_task_fallback(plan, selected_period_index, task_type="grammar", selected_day_index=None):
    """Add a task as fallback when AI fails"""
    try:
        if isinstance(plan, str):
            plan = json.loads(plan)

        plan_list = plan.get("plan", [])
        if selected_period_index >= len(plan_list):
            selected_period_index = 0

        period = plan_list[selected_period_index]
        days = period.get("days", [])

        if not days:
            days = [{"day": "Monday", "tasks": []}]
            period["days"] = days

        # Use the selected day index if provided and valid, otherwise default to day 0
        if selected_day_index is not None and 0 <= int(selected_day_index) < len(days):
            target_day = days[int(selected_day_index)]
        else:
            target_day = days[0]
        existing_count = len(target_day.get("tasks", []))
        
        if task_type == "grammar":
            new_task = {
                "task_id": f"{target_day.get('day', 'new').lower()[:3]}_grammar_{existing_count + 1}",
                "title": "Grammar Exercise: Fix the Sentences",
                "prompt": "Correct the following sentences:\n1. She go to school every day.\n2. They was happy yesterday.\n3. He don't like coffee.\n4. We was at the park.\n5. She have a new car.\n\nRewrite each sentence correctly.",
                "type": "grammar_exercise",
                "estimated_minutes": 20,
                "skills": ["grammar", "error correction"],
                "status": "todo",
                "materials": [
                    {"title": "Grammar Guide", "url": "https://www.grammarly.com/blog/grammar-basics/", "source": "Grammarly"},
                    {"title": "Purdue OWL Grammar", "url": "https://owl.purdue.edu/owl/general_writing/grammar/index.html", "source": "Purdue University"}
                ]
            }
        else:
            new_task = {
                "task_id": f"{target_day.get('day', 'new').lower()[:3]}_writing_{existing_count + 1}",
                "title": "Writing Practice",
                "prompt": "Write a paragraph (80-100 words) about your daily routine or a hobby you enjoy. Use correct grammar and punctuation.",
                "type": "writing_task",
                "estimated_minutes": 30,
                "skills": ["writing", "grammar"],
                "status": "todo",
                "materials": [
                    {"title": "Purdue OWL Writing Guide", "url": "https://owl.purdue.edu/owl/general_writing/academic_writing/index.html", "source": "Purdue University"},
                    {"title": "Grammarly Writing Tips", "url": "https://www.grammarly.com/blog/writing-tips/", "source": "Grammarly"}
                ]
            }
        
        if "tasks" not in target_day:
            target_day["tasks"] = []
        target_day["tasks"].append(new_task)
        
        Logger.info(f"Added fallback {task_type} task to {target_day.get('day')}")
        return plan
        
    except Exception as e:
        Logger.error(f"Failed to add fallback task: {e}")
        return plan

def Adjust_Plan(current_plan, instruction, selected_period_index=0, selected_day_index=None):
    """Adjust a plan based on user instruction"""

    if isinstance(current_plan, str):
        try:
            current_plan = json.loads(current_plan)
        except Exception as e:
            raise ValueError(f"Current_Plan string is not valid JSON: {e}")

    if not isinstance(current_plan, dict):
        raise ValueError("Current_Plan must be a dict")

    if "plan" not in current_plan:
        raise ValueError("Current_Plan missing 'plan' key")

    plan_list = current_plan.get("plan", [])
    if not isinstance(plan_list, list) or not plan_list:
        raise ValueError("Current_Plan.plan must be a non-empty list")

    idx = int(selected_period_index or 0)
    if idx < 0 or idx >= len(plan_list):
        idx = 0

    day_idx = int(selected_day_index) if selected_day_index is not None else None

    Logger.info(f"Adjusting plan period={idx} day={day_idx} instruction: {instruction[:100]}...")

    task_type = "grammar" if "grammar" in instruction.lower() else "writing"

    Logger.info(f"Using fallback to add {task_type} task")
    updated_plan = current_plan.copy()
    updated_plan = _add_task_fallback(updated_plan, idx, task_type, selected_day_index=day_idx)
    updated_plan["generated_at"] = datetime.utcnow().isoformat() + "Z"

    return updated_plan