"""
Database tests for Django models.

Uses pytest-django with @pytest.mark.django_db.
Tests Plan model and Task_Details creation/retrieval.

Note: these tests require a real (or test) database connection.
The Django test runner creates an isolated test database automatically.
"""

import pytest
from django.utils import timezone


# ── Personalized_Plan models ──────────────────────────────────────────────────

@pytest.mark.django_db
class TestPlanModel:
    """Test Plan model save and retrieve operations."""

    def test_plan_can_be_imported(self):
        """Verify the Plan model is importable and accessible."""
        try:
            from Personalized_Plan.models import Plan
            assert Plan is not None
        except ImportError:
            pytest.skip("Personalized_Plan.models not available in this environment")

    @pytest.mark.django_db
    def test_plan_save_and_retrieve(self):
        try:
            from Personalized_Plan.models import Plan
        except ImportError:
            pytest.skip("Personalized_Plan.models not available")

        # Create and save a plan
        plan = Plan(
            User_Id='test-user-001',
            Level='B1',
            Status='active',
        )
        plan.save()

        # Retrieve it back
        retrieved = Plan.objects.filter(User_Id='test-user-001').first()
        assert retrieved is not None
        assert retrieved.Level == 'B1'
        assert retrieved.Status == 'active'

    @pytest.mark.django_db
    def test_plan_str_representation(self):
        try:
            from Personalized_Plan.models import Plan
        except ImportError:
            pytest.skip("Personalized_Plan.models not available")

        plan = Plan(User_Id='str-test-user', Level='A2')
        plan.save()
        # __str__ should not raise
        assert str(plan) is not None


# ── Task_Details (Feedback model) ─────────────────────────────────────────────

@pytest.mark.django_db
class TestTaskDetailsModel:
    """Test Task_Details creation and field access."""

    def test_task_details_can_be_imported(self):
        try:
            from Personalized_Plan.models import Task_Details
            assert Task_Details is not None
        except ImportError:
            pytest.skip("Task_Details model not available")

    @pytest.mark.django_db
    def test_task_details_creation(self):
        try:
            from Personalized_Plan.models import Task_Details
        except ImportError:
            pytest.skip("Task_Details model not available")

        td = Task_Details(
            User_Id='task-user-001',
            Task_Id='task-abc-123',
            Input_Text='This is my writing submission.',
            Status='submitted',
        )
        td.save()

        retrieved = Task_Details.objects.filter(
            User_Id='task-user-001', Task_Id='task-abc-123'
        ).first()
        assert retrieved is not None
        assert retrieved.Input_Text == 'This is my writing submission.'

    @pytest.mark.django_db
    def test_task_details_status_field(self):
        try:
            from Personalized_Plan.models import Task_Details
        except ImportError:
            pytest.skip("Task_Details model not available")

        td = Task_Details(
            User_Id='task-user-002',
            Task_Id='task-def-456',
            Status='reviewed',
        )
        td.save()
        found = Task_Details.objects.get(Task_Id='task-def-456')
        assert found.Status == 'reviewed'


# ── Feedback_Result model ─────────────────────────────────────────────────────

@pytest.mark.django_db
class TestFeedbackResultModel:
    def test_feedback_result_can_be_imported(self):
        try:
            from Feedback.models import Feedback_Result
            assert Feedback_Result is not None
        except ImportError:
            pytest.skip("Feedback.models not available")

    @pytest.mark.django_db
    def test_feedback_result_save_scores(self):
        try:
            from Feedback.models import Feedback_Result
        except ImportError:
            pytest.skip("Feedback.models not available")

        fr = Feedback_Result(
            User_Id='fb-user-001',
            Text='Original text here.',
            Corrected='Corrected text here.',
            Overall_Score=78.5,
            Grammar_Score=80.0,
            Vocab_Score=75.0,
            Punct_Score=85.0,
        )
        fr.save()

        found = Feedback_Result.objects.filter(User_Id='fb-user-001').first()
        assert found is not None
        assert abs(found.Overall_Score - 78.5) < 0.01
