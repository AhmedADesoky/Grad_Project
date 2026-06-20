def validate_plan(plan):
    if not isinstance(plan, dict):
        raise ValueError("Plan must be a JSON object")

    required_keys = [
        "user_id",
        "cefr_level",
        "mode",
        "focus_skills",
        "generated_at",
        "starts_at",
        "ends_at",
        "current_period_index",
        "plan"
    ]
    for k in required_keys:
        if k not in plan:
            raise ValueError(f"Missing required key: {k}")

    if plan["mode"] not in ["weekly", "monthly"]:
        raise ValueError("mode must be weekly or monthly")

    if not isinstance(plan["focus_skills"], list):
        raise ValueError("focus_skills must be a list")

    if not isinstance(plan["current_period_index"], int):
        raise ValueError("current_period_index must be an integer")

    if not isinstance(plan["plan"], list) or not plan["plan"]:
        raise ValueError("plan must be a non-empty list")

    for i, period in enumerate(plan["plan"]):
        if not isinstance(period, dict):
            raise ValueError(f"plan[{i}] must be an object")

        if "days" not in period or not isinstance(period["days"], list):
            raise ValueError(f"plan[{i}].days must be a list")

        for d, day in enumerate(period["days"]):
            if not isinstance(day, dict):
                raise ValueError(f"plan[{i}].days[{d}] must be an object")
            if "tasks" not in day or not isinstance(day["tasks"], list):
                raise ValueError(f"plan[{i}].days[{d}].tasks must be a list")

            for j, task in enumerate(day["tasks"]):
                if not isinstance(task, dict):
                    raise ValueError(f"plan[{i}].days[{d}].tasks[{j}] must be an object")

                if not (task.get("prompt") or task.get("title") or task.get("type")):
                    raise ValueError(f"plan[{i}].days[{d}].tasks[{j}] must include prompt/title/type")

                if "task_id" not in task:
                    raise ValueError(f"plan[{i}].days[{d}].tasks[{j}] missing task_id")

    return True