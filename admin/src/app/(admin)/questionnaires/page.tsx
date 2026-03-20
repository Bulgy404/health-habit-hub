import styles from "./page.module.css";

export default function QuestionnairesPage() {
  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Questionnaires</h1>
        <p className={styles.subtitle}>Manage questionnaire definitions for study participants.</p>
      </div>
      <div className={styles.placeholder}>
        <span className={styles.placeholderIcon}>📋</span>
        <p>Questionnaire management coming soon.</p>
      </div>
    </div>
  );
}
