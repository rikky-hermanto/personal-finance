import type { useGoalOverlays } from '@/hooks/use-goals';
import type { FoundationCheck, Goal } from '@/types/Goal';
import { ContributionDialog } from './ContributionDialog';
import { GoalDrawer } from './GoalDrawer';
import { GoalFormDialog } from './GoalFormDialog';

interface GoalOverlaysProps {
  ui: ReturnType<typeof useGoalOverlays>;
  goals: Goal[];
  foundation: FoundationCheck | undefined;
}

/** The drawer, goal form and contribution form for a Big Purchases tab. */
export const GoalOverlays = ({ ui, goals, foundation }: GoalOverlaysProps) => {
  const pickable = goals.filter((g) => g.status === 'active' || g.status === 'paused');
  return (
    <>
      <GoalDrawer goal={ui.openGoal} foundation={foundation} onClose={ui.closeDrawer} onEdit={ui.editGoal} onContribute={ui.contribute} />
      <GoalFormDialog
        open={ui.form !== null}
        goal={ui.form === 'new' || ui.form === null ? null : ui.form}
        presetCategory={ui.preset}
        onClose={ui.closeForm}
      />
      <ContributionDialog
        open={ui.contribution !== null}
        goal={ui.contribution === 'pick' || ui.contribution === null ? null : ui.contribution}
        goals={pickable}
        onClose={ui.closeContribution}
      />
    </>
  );
};
