// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Japanese (`ja`).
class AppLocalizationsJa extends AppLocalizations {
  AppLocalizationsJa([String locale = 'ja']) : super(locale);

  @override
  String get appTitle => 'Health Habit Hub';

  @override
  String get shareHabit => '習慣をシェア';

  @override
  String get exploreHabits => '習慣を探索';

  @override
  String get settings => '設定';

  @override
  String get profile => 'プロフィール';

  @override
  String get habitSharedSuccess => '習慣をシェアしました！';

  @override
  String get submissionFailed => '送信に失敗しました。もう一度お試しください。';

  @override
  String get noConnection => '接続がありません';

  @override
  String get couldNotLoadSurvey => 'アンケートを読み込めませんでした。\n接続を確認してください。';

  @override
  String get retry => '再試行';

  @override
  String get refresh => '更新';

  @override
  String get graphTab => 'グラフ';

  @override
  String get statsTab => '統計';

  @override
  String get failedToLoadHabits => '習慣の読み込みに失敗しました';

  @override
  String get noHabitDataYet => 'まだ習慣データがありません。';

  @override
  String get couldNotSubmitAnnotation => '注釈を送信できませんでした';

  @override
  String get communityAnnotations => 'コミュニティの注釈';

  @override
  String get unknown => '不明';

  @override
  String iDoThisCount(String count) {
    return '私もやっている: $count';
  }

  @override
  String helpfulCount(String count) {
    return '役に立った: $count';
  }

  @override
  String get iDoThisToo => '私もやっている';

  @override
  String get helpful => '役に立った';

  @override
  String get failedToLoadSettings => '設定の読み込みに失敗しました';

  @override
  String get tokenCardFormat => 'トークンカード形式';

  @override
  String get tokenCardFormatDescription => '新規参加者のトークンカード生成時に使用する形式を選択します。';

  @override
  String get settingsSaved => '設定を保存しました';

  @override
  String get failedToSaveSettings => '設定の保存に失敗しました';

  @override
  String get privacyStatement => 'プライバシーポリシー';

  @override
  String get accessibilityStatement => 'アクセシビリティ声明';

  @override
  String get imprint => 'インプリント（運営者情報）';

  @override
  String get couldNotLoadLegalDocument => 'この文書を読み込めませんでした。\n接続を確認してください。';

  @override
  String get save => '保存';

  @override
  String get qrOnly => 'QRのみ';

  @override
  String get qrOnlyDescription => 'QRコードトークンのみを生成';

  @override
  String get printOnly => '印刷のみ';

  @override
  String get printOnlyDescription => '印刷用トークンカードのみを生成';

  @override
  String get both => '両方';

  @override
  String get bothDescription => 'QRコードと印刷用トークンカードを生成';

  @override
  String get myProfile => 'マイプロフィール';

  @override
  String get profileSavedSuccess => 'プロフィールを保存しました！';

  @override
  String get couldNotLoadProfile => 'プロフィールを読み込めませんでした。\n接続を確認してください。';

  @override
  String get healthQuestionnaires => '健康に関する質問票';

  @override
  String get sliqLifestyleIndex => 'SLIQ — ライフスタイル指標';

  @override
  String get rand36HealthSurvey => 'RAND-36 — 健康調査';

  @override
  String get restoreAccountOnDevice => 'この端末でアカウントを復元';

  @override
  String get profileCompleted => 'プロフィール完了';

  @override
  String completedOn(String date) {
    return '完了日: $date';
  }

  @override
  String get edit => '編集';

  @override
  String get appearance => '外観';

  @override
  String get light => 'ライト';

  @override
  String get system => 'システム';

  @override
  String get dark => 'ダーク';

  @override
  String get cancel => 'キャンセル';

  @override
  String get delete => '削除';

  @override
  String get create => '作成';

  @override
  String get apply => '適用';

  @override
  String get adminDeviceSessions => 'デバイスセッション';

  @override
  String get adminRevokeSessionTitle => 'セッションを無効化しますか？';

  @override
  String adminRevokeSessionContent(String participantId) {
    return '参加者 $participantId のセッションを無効化しますか？\nただちにログアウトされます。';
  }

  @override
  String get adminRevoke => '無効化';

  @override
  String get adminSessionRevoked => 'セッションを無効化しました';

  @override
  String get adminFailedToRevokeSession => 'セッションの無効化に失敗しました';

  @override
  String get adminNoActiveSessions => 'アクティブなセッションはありません';

  @override
  String get adminFailedToLoadSessions => 'セッションの読み込みに失敗しました';

  @override
  String get adminColParticipantId => '参加者ID';

  @override
  String get adminColDeviceType => 'デバイス種別';

  @override
  String get adminColAppVersion => 'アプリバージョン';

  @override
  String get adminColLastSeen => '最終アクセス';

  @override
  String get adminColSessionId => 'セッションID';

  @override
  String get adminColActions => '操作';

  @override
  String get adminDonatedHabits => 'シェアされた習慣';

  @override
  String get adminAutoRefreshOn => '自動更新オン';

  @override
  String get adminAutoRefreshOff => '自動更新オフ';

  @override
  String get adminCouldNotOpenExportUrl => 'エクスポートURLを開けませんでした';

  @override
  String get adminCsvExportFailed => 'CSVエクスポートに失敗しました';

  @override
  String get adminAllDates => 'すべての日付';

  @override
  String get adminGroup => 'グループ';

  @override
  String get adminCategory => 'カテゴリー';

  @override
  String get adminAll => 'すべて';

  @override
  String get adminClearDateRange => '期間指定をクリア';

  @override
  String get adminCsv => 'CSV';

  @override
  String get adminNoHabitDonationsFound => 'シェアされた習慣が見つかりません';

  @override
  String get adminFailedToLoadHabitDonations => 'シェアされた習慣の読み込みに失敗しました';

  @override
  String adminParticipantTitle(String participantId) {
    return '参加者 $participantId';
  }

  @override
  String get adminExportJson => 'JSONをエクスポート';

  @override
  String get adminFailedToExportProgress => '進捗データのエクスポートに失敗しました。';

  @override
  String get adminProfileCard => 'プロフィール';

  @override
  String get adminProfileNotYetCompleted => '未完了';

  @override
  String adminSurveysCompleted(int count) {
    return '完了したアンケート（$count）';
  }

  @override
  String get adminNoSurveysCompletedYet => '完了したアンケートはまだありません。';

  @override
  String adminHabitsDonated(int count) {
    return 'シェアされた習慣（$count）';
  }

  @override
  String get adminNoHabitsDonatedYet => 'シェアされた習慣はまだありません。';

  @override
  String adminHabitsDonatedDetail(int count) {
    return '$count件の習慣がシェアされました。個々の習慣の詳細は習慣モニターで確認できます。';
  }

  @override
  String get adminRecommendations => '推奨';

  @override
  String get adminAccepted => '承認済み';

  @override
  String get adminDismissed => '却下済み';

  @override
  String get adminTimeline => 'タイムライン';

  @override
  String get adminNoTimelineEventsYet => 'タイムラインのイベントはまだありません。';

  @override
  String get adminTimelineEnrolled => '登録済み';

  @override
  String get adminTimelineSurveyCompleted => 'アンケート完了';

  @override
  String get adminTimelineRecommendationAccepted => '推奨を承認';

  @override
  String get adminTimelineRecommendationDismissed => '推奨を却下';

  @override
  String get adminFailedToLoadParticipantProgress => '参加者の進捗の読み込みに失敗しました。';

  @override
  String get adminParticipants => '参加者';

  @override
  String get adminNoParticipantsFound => '参加者が見つかりません。';

  @override
  String get adminSearchByUsername => 'ユーザー名で検索…';

  @override
  String get adminAllGroups => 'すべてのグループ';

  @override
  String get adminColUsername => 'ユーザー名';

  @override
  String get adminColEnrolled => '登録日';

  @override
  String get adminColLastActive => '最終アクティブ';

  @override
  String get adminColSurveysPercent => 'アンケート %';

  @override
  String get adminDeleteParticipant => '参加者を削除';

  @override
  String get adminFailedToUpdateGroup => 'グループの更新に失敗しました。';

  @override
  String get adminDeleteParticipantTitle => '参加者の削除';

  @override
  String get adminDeleteParticipantContent => '参加者データは匿名化されます。この操作は取り消せません。';

  @override
  String get adminFailedToDeleteParticipant => '参加者の削除に失敗しました。';

  @override
  String adminParticipantCreated(String username) {
    return '参加者 $username を作成しました';
  }

  @override
  String get adminCreateParticipantTooltip => '参加者を作成';

  @override
  String get adminFailedToLoadParticipants => '参加者の読み込みに失敗しました。';

  @override
  String get adminPrevious => '前へ';

  @override
  String get adminNext => '次へ';

  @override
  String get adminCreateParticipantTitle => '参加者の作成';

  @override
  String get adminStudyGroup => '研究グループ';

  @override
  String get adminTokenCardFormat => 'トークンカード形式';

  @override
  String get adminQrAndPrint => 'QR + 印刷';

  @override
  String get adminFailedToCreateParticipant => '参加者の作成に失敗しました。もう一度お試しください。';

  @override
  String get adminSurveys => 'アンケート';

  @override
  String get adminFailedToUpdateStatus => 'ステータスの更新に失敗しました';

  @override
  String get adminNewSurveyTooltip => '新規アンケート';

  @override
  String get adminNoSurveysFound => 'アンケートが見つかりません';

  @override
  String get adminFailedToLoadSurveys => 'アンケートの読み込みに失敗しました';

  @override
  String get adminPublish => '公開';

  @override
  String get adminArchive => 'アーカイブ';

  @override
  String get adminNewSurveyTitle => '新規アンケート';

  @override
  String get adminSurveyTitleLabel => 'タイトル';

  @override
  String get adminSurveyTypeLabel => '種類';

  @override
  String get adminTitleIsRequired => 'タイトルは必須です';

  @override
  String get adminFailedToCreateSurvey => 'アンケートの作成に失敗しました';

  @override
  String get adminSurveyEditor => 'アンケートエディター';

  @override
  String get adminInvalidJson => '無効なJSONです — 保存前に修正してください';

  @override
  String get adminSurveySaved => 'アンケートを保存しました';

  @override
  String get adminFailedToSaveSurvey => 'アンケートの保存に失敗しました';

  @override
  String get adminFailedToLoadSurvey => 'アンケートの読み込みに失敗しました';

  @override
  String get adminJsonSchema => 'JSONスキーマ';

  @override
  String get adminAssignToGroups => 'グループに割り当て';

  @override
  String get failedToLoadStats => '統計の読み込みに失敗しました';

  @override
  String get failedToLoadQuestionnaire => '質問票を読み込めませんでした。';

  @override
  String get getRecommendations => '推奨を取得';

  @override
  String get healthGoalPrompt => 'どのような健康目標に取り組みたいですか？';

  @override
  String get questionnaireResponseSubmitted => '回答を送信しました！';

  @override
  String get questionnaireThankYou =>
      '質問票へのご回答ありがとうございます。あなたの回答は習慣の推奨のパーソナライズに役立てられます。';

  @override
  String get backToProfile => 'プロフィールに戻る';

  @override
  String get thankYou => 'ありがとうございます';

  @override
  String get noQuestionnairesAssigned => 'あなたの研究に割り当てられた質問票はありません。';

  @override
  String get myHabitsTab => 'マイ習慣';

  @override
  String get newHabit => '新しい習慣';

  @override
  String get noHabitsYet => 'まだ習慣がありません。\n「新しい習慣」をタップして始めましょう。';

  @override
  String get logToday => '今日を記録';

  @override
  String get loggedToday => '記録済み ✓';

  @override
  String get pickBehaviorTitle => 'どんな習慣を身につけたいですか？';

  @override
  String get setCueTitle => 'きっかけを設定';

  @override
  String get setCuePreRatedInstruction =>
      'あなたの研究条件では次のきっかけが割り当てられます。よく読んでください — これが行動するタイミングです。';

  @override
  String get setCueSelfSelectedInstruction =>
      'あなたの生活の中で定期的に起こる具体的な瞬間を記述してください。';

  @override
  String get setCuePlaceholder => '例：毎晩夕食の後に';

  @override
  String get setCueTooShort => 'きっかけは10文字以上で記述してください。';

  @override
  String get confirmPlanTitle => 'あなたのプラン';

  @override
  String get confirmPlanSubtitle => '実行意図を読んで確認してください。';

  @override
  String get durationLabel => '所要時間（分）';

  @override
  String get createHabit => '習慣を作成';

  @override
  String get habitLimitReached => 'あなたの研究条件における習慣数の上限に達しました。';

  @override
  String get srhiCheckInTitle => '週次習慣チェックイン';

  @override
  String get srhiCheckInSubtitle => '所要時間は約2分です。';

  @override
  String get srhiStartButton => 'チェックインを開始';

  @override
  String get srhiFormTitle => '習慣チェックイン';

  @override
  String srhiStem(String behavior) {
    return '私の$behaviorは…';
  }

  @override
  String get srhiSubmit => '送信';

  @override
  String get srhiSubmitIncomplete => '送信する前に12項目すべてを評価してください。';

  @override
  String weekLabel(int n) {
    return '第$n週';
  }

  @override
  String get habitDetailTitle => '習慣の詳細';

  @override
  String get abandonHabit => '習慣をやめる';

  @override
  String get abandonConfirm => 'この習慣をやめてもよろしいですか？この操作は取り消せません。';

  @override
  String get confirm => '確認';

  @override
  String get heatmapTitle => '活動記録';

  @override
  String get trajectoryTitle => '習慣の強さ';

  @override
  String get enactedLabel => '実行';

  @override
  String get missedLabel => '未実行';

  @override
  String get noLogsYet => 'まだ活動が記録されていません。';

  @override
  String get noTrajectoryYet => 'SRHIデータは最初の週次チェックイン後に表示されます。';

  @override
  String get consentTitle => '研究の説明と同意';

  @override
  String get consentUpdatedTitle => '更新された同意書';

  @override
  String get consentConfirmText => '「同意します」をタップすることで、研究に関する情報を読んで理解し、自発的に参加することを確認したことになります。';

  @override
  String get consentAccept => '同意します';

  @override
  String get consentDecline => '同意しません';

  @override
  String get consentCouldNotLoad => '同意書を読み込めませんでした。接続を確認してください。';

  @override
  String get deleteAccount => 'アカウントを削除';

  @override
  String get deleteAccountTitle => 'アカウントを削除しますか？';

  @override
  String get deleteAccountContent => 'アカウントと、それに紐づくすべてのデータ（プロフィール、研究参加、習慣プラン、毎日の記録、質問票の回答、推奨）が完全に削除されます。\n\n提供された習慣は匿名で保存されており、あなたに紐づけることはできません。\n\nこの操作は取り消せません。';

  @override
  String get deleteAccountConfirm => '完全に削除';

  @override
  String get deleteAccountFailed => 'アカウントの削除に失敗しました。接続を確認して、もう一度お試しください。';

  @override
  String get exportMyData => 'データをエクスポート';

  @override
  String get exportFailed => 'エクスポートに失敗しました。接続を確認して、もう一度お試しください。';

  @override
  String get myDataSection => 'マイデータ';

  @override
  String get studyConsent => '研究への同意';

  @override
  String get legalSection => '法的情報';

  @override
  String get language => '言語';

  @override
  String get signOut => 'サインアウト';

  @override
  String get signOutConfirm => '本当にサインアウトしますか？';

  @override
  String get aiDisclaimer => 'あなたの研究データに基づくAI生成の提案です。これは医学的助言ではありません。健康上の懸念がある場合は医師にご相談ください。';

  @override
  String get dailyReminderLabel => '毎日のリマインダー';

  @override
  String get noReminders => 'リマインダーなし';

  @override
  String get reminderFadingHint => '習慣が強くなるにつれて、リマインダーの頻度は減っていきます。';

  @override
  String get doneButton => '完了';

  @override
  String get habitStrengthLabel => '習慣の強さ';

  @override
  String get commentsTitle => 'コメント';

  @override
  String get commentHint => '感想をシェア（匿名）…';

  @override
  String get noCommentsYet => 'まだコメントはありません。最初のコメントを書きましょう。';

  @override
  String get couldNotPostComment => 'コメントを投稿できませんでした';

  @override
  String get likeTooltip => 'いいね';

  @override
  String get adminComments => 'コメント';

  @override
  String get adminDeleteCommentTitle => 'コメントを削除しますか？';

  @override
  String get adminDeleteCommentContent => 'このコメントはすべての参加者から削除されます。取り消せません。';

  @override
  String get adminFailedToDeleteComment => 'コメントの削除に失敗しました';

  @override
  String get adminFailedToLoadComments => 'コメントの読み込みに失敗しました';

  @override
  String get adminNoCommentsYet => 'まだコメントはありません。';
}
