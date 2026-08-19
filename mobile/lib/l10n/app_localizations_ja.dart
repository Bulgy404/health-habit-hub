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
  String get questionnaireAlreadyCompleted =>
      'この質問票はすでに完了しており、まだ再度回答することはできません。';

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
    return '保存済み: $count';
  }

  @override
  String get iDoThisToo => '私もやっている';

  @override
  String get helpful => '保存';

  @override
  String get savedSection => '保存済み';

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
  String get profileEnterNumber => '数値を入力';

  @override
  String get profileEnterText => 'テキストを入力';

  @override
  String profileIncompleteBanner(String fields) {
    return 'プロフィールに未入力の項目があります: $fields';
  }

  @override
  String get profileCompleteNow => '今すぐ入力';

  @override
  String get couldNotLoadProfile => 'プロフィールを読み込めませんでした。\n接続を確認してください。';

  @override
  String get healthQuestionnaires => '健康に関する質問票';

  @override
  String get sliqLifestyleIndex => 'SLIQ：ライフスタイル指標';

  @override
  String get rand36HealthSurvey => 'RAND-36：健康調査';

  @override
  String get restoreAccountOnDevice => 'この端末でアカウントを復元';

  @override
  String get studyMembershipTitle => '研究';

  @override
  String get studyMembershipCurrentLabel => '現在の研究';

  @override
  String get studyMembershipDefaultLabel => '一般研究（研究コードなし）';

  @override
  String studyMembershipGroupLabel(String groupLabel) {
    return 'グループ: $groupLabel';
  }

  @override
  String get studyMembershipLoadFailed => '研究情報を読み込めませんでした。';

  @override
  String get studyMembershipJoinButton => '別の研究に参加する';

  @override
  String get studyMembershipLeaveButton => '研究から離脱する';

  @override
  String get studyMembershipJoinDialogTitle => '研究に参加する';

  @override
  String get studyMembershipJoinDialogBody =>
      '研究者から受け取った研究コードを入力してください。すでに共有した習慣・記録・回答は現在の研究に残ります。今後の行動のみが新しい研究に反映されます。';

  @override
  String get studyMembershipCodeLabel => '研究コード';

  @override
  String get studyMembershipJoinConfirm => '参加する';

  @override
  String studyMembershipJoinSuccess(String studyName) {
    return '$studyNameに参加しました。';
  }

  @override
  String get studyMembershipAlreadyInStudy => 'すでにその研究に参加しています。';

  @override
  String get studyMembershipInvalidCode => '無効なコードです。確認してもう一度お試しください。';

  @override
  String get studyMembershipCodeExpired => 'このコードは有効期限が切れています。';

  @override
  String get studyMembershipCodeUsedUp => 'このコードはすでに使い切られています。';

  @override
  String get studyMembershipJoinFailed => '研究に参加できませんでした。接続を確認してください。';

  @override
  String get studyMembershipLeaveConfirmTitle => 'この研究から離脱しますか？';

  @override
  String get studyMembershipLeaveConfirmBody =>
      '一般研究に移動します。データは削除されません。これまでの習慣・記録・アンケートの回答はそのまま保持され、引き続きこの研究に紐づけられます。';

  @override
  String get studyMembershipLeaveSuccess => '研究から離脱しました。';

  @override
  String get studyMembershipLeaveFailed => '研究から離脱できませんでした。接続を確認してください。';

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
  String get adminInvalidJson => '無効なJSONです。保存前に修正してください';

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
  String get goalInputSubtitle =>
      '背景（生活スタイル、これまで試したこと、うまくいかない理由など）を詳しく共有するほど、おすすめの精度が上がります。';

  @override
  String get goalInputHint =>
      '例：34歳、デスクワークで長時間座っています。夜0時前に寝つけず、朝は疲れが取れません。夜のランニングを試しましたが1週間で挫折しました。無理なく続けられて、ぐっすり休めるようになる習慣が欲しいです。';

  @override
  String get goalInputValidationError => '目標を入力してください';

  @override
  String get recommendWhyCardTitle => 'おすすめはどのように作られますか？';

  @override
  String get recommendWhyCardBody =>
      'あなたの目標を他の人が共有した似た習慣と照合し、言語モデルが最も近い事例をパーソナライズされた提案に変換します。';

  @override
  String get recommendWhyCardLink => '仕組みを見る';

  @override
  String get questionnaireResponseSubmitted => '回答を送信しました！';

  @override
  String get questionnaireThankYou =>
      '質問票へのご回答ありがとうございます。あなたの回答は習慣の推奨のパーソナライズに役立てられます。';

  @override
  String get backToProfile => 'プロフィールに戻る';

  @override
  String get backToShare => 'もう一つ習慣を共有する';

  @override
  String get thankYou => 'ありがとうございます';

  @override
  String get noQuestionnairesDue => '現在回答が必要な質問票はありません。';

  @override
  String questionnaireCompletedOn(String date) {
    return '$dateに完了';
  }

  @override
  String get questionnaireNotYetAvailable => 'まだ利用できません';

  @override
  String get myHabitsTab => 'マイ習慣';

  @override
  String get exploreSavedTab => '保存済み';

  @override
  String get navTabShare => '共有';

  @override
  String get navTabExplore => '探索';

  @override
  String get navTabRecommend => 'おすすめ';

  @override
  String get navTabAccount => 'アカウント';

  @override
  String get newHabit => '新しい習慣';

  @override
  String get noHabitsYet => 'まだ習慣がありません。\n「新しい習慣」をタップして始めましょう。';

  @override
  String get logToday => '今日を記録';

  @override
  String get loggedToday => '記録済み ✓';

  @override
  String get logForAnotherDay => '別の日を記録';

  @override
  String get backfillSheetTitle => '別の日を記録する';

  @override
  String get backfillSheetSubtitle => '日付をタップして完了にする、またはもう一度タップして取り消します。';

  @override
  String get today => '今日';

  @override
  String get yesterday => '昨日';

  @override
  String get pickBehaviorTitle => 'どんな習慣を身につけたいですか？';

  @override
  String get setCueTitle => 'きっかけを設定';

  @override
  String get setCuePreRatedInstruction =>
      'あなたの研究条件では次のきっかけが割り当てられます。よく読んでください。これが行動するタイミングです。';

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
  String get confirmPlanEditHint => '意図を編集…';

  @override
  String confirmPlanReminderAtTime(String time) {
    return '$timeにリマインダー（研究の設定）';
  }

  @override
  String get confirmPlanNoRemindersByStudy => 'リマインダーなし（研究の設定）';

  @override
  String get confirmPlanShareWithCommunity => 'この習慣をコミュニティと匿名で共有する';

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
    return '$behaviorは…';
  }

  @override
  String get srhiScaleMin => '1 = まったくそう思わない';

  @override
  String get srhiScaleMax => '7 = 強くそう思う';

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
  String get srhiChartWeekAxis => '調査週';

  @override
  String get srhiChartScoreAxis => 'SRHIスコア（1〜7）';

  @override
  String srhiChartTooltip(int week, String score) {
    return '第$week週：$score / 7';
  }

  @override
  String get automaticityTitle => 'Automaticity';

  @override
  String get automaticityExplanationBody =>
      'Automaticity combines your habit strength, recent adherence, and current streak into a single 0-100% score of how self-sustaining this habit has become. It\'s the same signal that determines how often you\'re reminded.';

  @override
  String get noAutomaticityYet =>
      'Automaticity data will appear after your first weekly check-in.';

  @override
  String get automaticityChartScoreAxis => 'Automaticity';

  @override
  String automaticityChartTooltip(int week, String percent) {
    return 'Week $week: $percent%';
  }

  @override
  String get srhiExplanationTitle => 'SRHIとは？';

  @override
  String get srhiExplanationBody =>
      'SRHI（習慣自己報告指標）は、この行動がどれくらい自動的に感じられるかを1〜7の尺度で測定します。スコアが高いほど意識的な努力が少なくて済み、習慣が日常に定着しつつあることを示します。';

  @override
  String get srhiScoreLabel => '現在のSRHIスコア';

  @override
  String get srhiScoreUnavailable => 'まだ利用できません';

  @override
  String get srhiNextCheckInLabel => '次回のチェックイン';

  @override
  String get srhiNextCheckInDue => '現在対応可能';

  @override
  String get srhiNextCheckInNone => '予定なし';

  @override
  String get consentTitle => '研究の説明と同意';

  @override
  String get consentUpdatedTitle => '更新された同意書';

  @override
  String get consentConfirmText =>
      '「同意します」をタップすることで、研究に関する情報を読んで理解し、自発的に参加することを確認したことになります。';

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
  String get deleteAccountContent =>
      'この操作によりアカウントとログイン情報が完全に削除されます。再度サインインすることはできず、元に戻すこともできません。\n\n提供いただいたデータ(習慣プラン、毎日の記録、質問票の回答、寄付データ)はサーバー上に残りますが、匿名の情報としてのみ保存されます。アカウントと識別情報が削除された後は、これらのデータをあなたに紐づけることはできません。\n\nご質問やご懸念がある場合は、以下をご覧ください:';

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
  String get signingOut => 'サインアウトしています…';

  @override
  String get sessionExpiredMessage => 'セッションの有効期限が切れました。続けるには再度サインインしてください。';

  @override
  String get signInAction => 'サインイン';

  @override
  String get aiDisclaimer =>
      'あなたの研究データに基づくAI生成の提案です。これは医学的助言ではありません。健康上の懸念がある場合は医師にご相談ください。';

  @override
  String get dailyReminderLabel => '毎日のリマインダー';

  @override
  String get habitCadenceQuestion => '頻度は？';

  @override
  String get habitCadenceDaily => '毎日';

  @override
  String get habitCadenceWeeklyOption => '週に n 回';

  @override
  String habitCadenceTargetLabel(int count) {
    return '週に$count回';
  }

  @override
  String weeklyProgressLabel(int done, int target) {
    return '今週 $done / $target';
  }

  @override
  String weeklyStreakLabel(int count) {
    return '$count週連続';
  }

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
  String get commentPendingReview => 'コメントは審査のために送信されました。承認され次第表示されます。';

  @override
  String get reportComment => '報告';

  @override
  String get reportCommentTitle => 'コメントを報告しますか?';

  @override
  String get reportCommentBody => 'このコメントは直ちに非表示になり、研究チームの審査に送られます。';

  @override
  String get commentReported => 'コメントを報告しました';

  @override
  String get couldNotReportComment => 'コメントを報告できませんでした';

  @override
  String get commentsDisabledMessage =>
      'コメント機能はオフになっています。表示・投稿するには設定でオンにしてください。';

  @override
  String get communitySection => 'コミュニティ';

  @override
  String get communityComments => 'コミュニティコメント';

  @override
  String get communityCommentsSubtitle =>
      'オフにすると、共有された習慣へのコメントの投稿と閲覧が非表示になります。';

  @override
  String get likeTooltip => '';

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

  @override
  String get onboardingShareHabitTitle => '習慣をシェアする';

  @override
  String get onboardingShareHabitDescription =>
      'あなたの個人的な習慣を研究者と共有し、日常の行動についてのより深い理解を築く手助けをしましょう。投稿内容は匿名化され、科学研究のみに使用されます。習慣が共有されるたびに、データセットはみんなにとってより価値のあるものになります。';

  @override
  String get onboardingExploreAnnotateTitle => '探索して注釈をつける';

  @override
  String get onboardingExploreAnnotateDescription =>
      'インタラクティブな習慣グラフを閲覧して、コミュニティ内で習慣がどのように関連しているかを発見しましょう。つながりに注釈を付けたり、背景情報を追加したりして、共有の知識ベースをより良いものにできます。探索すればするほど、グラフはより豊かになります。';

  @override
  String get onboardingRecommendationsTitle => 'おすすめを受け取る';

  @override
  String get onboardingRecommendationsDescription =>
      'あなたのプロフィールと全体のデータセットに基づいた、パーソナライズされた習慣のおすすめを受け取りましょう。私たちのレコメンドエンジンはコミュニティの投稿から学習し、あなたのライフスタイルに合った習慣を提案します。似たプロフィールを持つ人が役立てた新しい習慣を発見しましょう。';

  @override
  String get onboardingSubtitle =>
      'あなたの習慣が、日常の行動についてのより深い理解を築く手助けとなる、市民参加型科学プラットフォームです。';

  @override
  String get onboardingGetStarted => 'はじめる';

  @override
  String get onboardingRestoreAccount => '既存のアカウントを復元';

  @override
  String get onboardingSkip => 'スキップ';

  @override
  String get onboardingContinue => '続ける';

  @override
  String get onboardingNext => '次へ';

  @override
  String get studyCodeAppBarTitle => '研究コード';

  @override
  String get studyCodeQuestion => '研究コードをお持ちですか？';

  @override
  String get studyCodeSubtitle =>
      '研究者から研究コードを受け取っている場合は、ここに入力してその研究に参加できます。このステップはスキップすることもできます。';

  @override
  String get studyCodeLabel => '研究コード';

  @override
  String get studyCodeInvalidFormat => 'HHH-XXXXX形式の正しいコードを入力してください。';

  @override
  String get studyCodeInvalid => '無効なコードです。確認してもう一度お試しください。';

  @override
  String get studyCodeExpired => 'このコードは有効期限が切れています。';

  @override
  String get studyCodeAlreadyUsed => 'このコードはすでに使用されています。';

  @override
  String get studyCodeGenericError => 'コードを利用できませんでした。接続を確認してください。';

  @override
  String get studyCodeSkipError => 'コードなしでの参加に失敗しました。接続を確認してもう一度お試しください。';

  @override
  String get studyCodeContinueButton => 'コードを使って続ける';

  @override
  String get studyCodeSkipButton => '研究コードなしで参加する';

  @override
  String get adminQuestionnairesDeleteConfirmTitle => 'アンケートを削除しますか?';

  @override
  String adminQuestionnairesDeleteConfirmMessage(String title) {
    return '「$title」を削除しますか?この操作は元に戻せません。';
  }

  @override
  String get adminQuestionnairesDeleteConflict =>
      '削除できません: このアンケートは進行中の研究に割り当てられています。';

  @override
  String get adminQuestionnairesDeleteForbidden => 'ライブラリのアンケートは削除できません。';

  @override
  String get adminQuestionnairesDeleteFailed => 'アンケートの削除に失敗しました。';

  @override
  String get adminQuestionnairesTitle => 'アンケート';

  @override
  String get adminQuestionnairesLibraryLabel => 'ライブラリ';

  @override
  String get adminQuestionnairesCustomTab => 'カスタム';

  @override
  String get adminQuestionnairesNewTooltip => '新しいアンケート';

  @override
  String get adminQuestionnairesLoadFailed => 'アンケートの読み込みに失敗しました。';

  @override
  String get adminQuestionnairesLibraryEmpty => 'ライブラリのアンケートが見つかりません。';

  @override
  String get adminQuestionnairesCustomEmpty =>
      'カスタムアンケートはまだありません。\n+をタップして作成してください。';

  @override
  String adminQuestionnairesItemCount(int count) {
    return '$count問';
  }

  @override
  String get adminQuestionnairesInactiveChip => '非アクティブ';

  @override
  String get adminQuestionnairesEditDialogTitle => 'アンケートを編集';

  @override
  String get adminQuestionnairesNewDialogTitle => '新しいアンケート';

  @override
  String get adminQuestionnairesTitleFieldLabel => 'タイトル *';

  @override
  String get adminQuestionnairesFieldRequiredError => '必須項目です';

  @override
  String get adminQuestionnairesDescriptionFieldLabel => '説明';

  @override
  String adminQuestionnairesQuestionsCount(int count) {
    return '質問（$count）';
  }

  @override
  String get adminQuestionnairesAddButton => '追加';

  @override
  String get adminQuestionnairesNoQuestionsYet =>
      '質問がまだありません。「追加」をタップして作成してください。';

  @override
  String get adminQuestionnairesAllQuestionsNeedText => 'すべての質問にテキストを入力してください。';

  @override
  String get adminQuestionnairesSaveFailed => 'アンケートの保存に失敗しました。';

  @override
  String get adminQuestionnairesCreateButton => '作成';

  @override
  String adminQuestionnairesQuestionNumber(int number) {
    return '問$number';
  }

  @override
  String get adminQuestionnairesQuestionTextFieldLabel => '質問文';

  @override
  String get adminQuestionnairesTypeFieldLabel => '種類';

  @override
  String get adminQuestionnairesTypeOpenText => '自由記述';

  @override
  String get adminQuestionnairesTypeSingleChoice => '単一選択';

  @override
  String get adminQuestionnairesTypeMultiChoice => '複数選択';

  @override
  String get adminQuestionnairesTypeScale => '尺度';

  @override
  String get adminQuestionnairesRequiredLabel => '必須';

  @override
  String adminQuestionnairesOptionsCount(int count) {
    return '選択肢（$count）';
  }

  @override
  String get adminQuestionnairesAddOption => '選択肢を追加';

  @override
  String adminQuestionnairesOptionLabelField(int number) {
    return '選択肢$numberのラベル';
  }

  @override
  String get adminShellNavParticipants => '参加者';

  @override
  String get adminShellNavSurveys => 'アンケート';

  @override
  String get adminShellNavQuestionnaires => 'アンケート';

  @override
  String get adminShellNavHabits => '習慣';

  @override
  String get adminShellNavDevices => 'デバイス';

  @override
  String get adminShellNavSettings => '設定';

  @override
  String get recommendationResultsTitle => 'おすすめ';

  @override
  String get recommendationTryAgain => 'もう一度試す';

  @override
  String get recommendationEmptyMessage =>
      'おすすめは生成されませんでした。目標をもう少し詳しく説明してみてください。共有する情報が多いほど、より良い結果が得られます。';

  @override
  String get recommendationTryDifferentGoal => '別の目標を試す';

  @override
  String get recommendationHabitFlowError => '習慣作成画面を開けませんでした。もう一度お試しください。';

  @override
  String get recommendationWhyThisHelps => 'これが役立つ理由:';

  @override
  String recommendationSourcesCount(int count) {
    return '情報源（$count）';
  }

  @override
  String get recommendationAddToHabits => '自分の習慣に追加';

  @override
  String get recommendationFeedbackSubmitted => 'フィードバックを送信しました。ありがとうございます!';

  @override
  String get recommendationLeaveComment => 'コメントを残す:';

  @override
  String get recommendationFeedbackHint => 'フィードバックを入力…';

  @override
  String get recommendationFeedbackFailed => 'フィードバックを送信できませんでした';

  @override
  String get recommendationSourceLinkError => '情報源のリンクを開けませんでした。';

  @override
  String get recommendationLoadingPhaseCommunity => 'あなたと似た人が試した習慣と比較しています…';

  @override
  String get recommendationLoadingPhaseHistory => 'あなたにすでに効果があることを確認しています…';

  @override
  String get recommendationLoadingPhaseResearch => '行動変容研究を参照しています…';

  @override
  String get recommendationLoadingPhaseGenerating => 'あなた専用の提案を作成しています…';

  @override
  String get recommendationLoadingTimeoutError =>
      'おすすめの生成に時間がかかりすぎました。もう一度お試しください。';

  @override
  String get recommendationLoadingGenericError =>
      'おすすめの生成中に問題が発生しました。もう一度お試しください。';

  @override
  String get bubbleGraphNoHabitsInDimension => 'このカテゴリにはまだ習慣がありません。';

  @override
  String get bubbleGraphAllCategories => 'すべてのカテゴリ';

  @override
  String bubbleGraphHabitCount(int count) {
    return '習慣$count件';
  }

  @override
  String get bubbleGraphDimensionTime => '時間';

  @override
  String get bubbleGraphDimensionBehavior => '行動';

  @override
  String get bubbleGraphDimensionLocation => '場所';

  @override
  String get bubbleGraphDimensionPriorBehavior => '先行行動';

  @override
  String get bubbleGraphDimensionSocial => '社会的';

  @override
  String get bubbleGraphDimensionMentalState => '心理状態';

  @override
  String get bubbleGraphDimensionReasoning => '理由付け';

  @override
  String recommendationCardWhyTitle(String habitName) {
    return '「$habitName」がおすすめの理由';
  }

  @override
  String get recommendationCardEvidence => '根拠';

  @override
  String get recommendationCardConfidence => '信頼度';

  @override
  String get recommendationCardWhy => '理由';

  @override
  String get recommendationCardDismiss => '興味なし';

  @override
  String get recommendationCardAccept => '追加する';

  @override
  String get questionnaireFormRequiredQuestion => 'この質問は必須です。';

  @override
  String get questionnaireFormAnswerAllRequired => '送信する前に、すべての必須質問に回答してください。';

  @override
  String questionnaireFormProgressLabel(int current, int total) {
    return '質問 $current/$total';
  }

  @override
  String get questionnaireFormBackButton => '戻る';

  @override
  String get questionnaireFormSubmitButton => '送信';

  @override
  String get questionnaireFormSaveAndContinueButton => '保存して次へ';

  @override
  String get questionnaireFormAnswerHint => '回答を入力…';

  @override
  String get questionnaireFallbackTitle => 'アンケート';

  @override
  String get donateShareEyebrow => '習慣をシェア';

  @override
  String get donateHeroTitle => 'あなたの習慣を研究のためにシェアしよう';

  @override
  String get donateHeroSubtitle => '匿名 · 約2分 · 世界中の研究者に貢献できます';

  @override
  String get donateStartSharingButton => 'シェアを始める';

  @override
  String get donateQuestionnaireEyebrow => 'アンケート';

  @override
  String get donateQuestionnaireDueSubtitle => '短いアンケート · 今すぐ回答をお願いします';

  @override
  String get donateCompleteButton => '回答する';

  @override
  String get donateSharedTodayTitle => '本日シェア済み';

  @override
  String get donateSharedTodayBody =>
      'ご協力ありがとうございます！共有していただいた習慣はすべて研究の役に立っています。よろしければもう一つ共有してみませんか。';

  @override
  String get donateShareAnotherButton => '別の習慣を共有する';

  @override
  String get donateWhyShareTitle => 'なぜシェアするの？';

  @override
  String get donateWhyShareBody =>
      'シェアされた習慣は匿名のまま、研究者があなたを含むすべての人へのおすすめをより良くするために役立てられます。';

  @override
  String get readMoreAboutProject => 'プロジェクトについてもっと詳しく';

  @override
  String get donatePleaseAnswerAllQuestions => 'すべての質問に回答してください';

  @override
  String get donateNotAHabitMessage =>
      'これは習慣のようには見えません。「毎朝30分散歩する」のように、繰り返し行っている行動を説明してみてください。';

  @override
  String get donateSavedOffline => 'オフラインで保存しました。接続が回復次第、自動的に送信されます';

  @override
  String get donateUnauthorized => '認証エラーです。もう一度サインインしてください。';

  @override
  String get donateAnalysisUnavailable =>
      '習慣の分析は一時的にご利用いただけません。しばらくしてからもう一度お試しください。';

  @override
  String get donateTodaysTasksEyebrow => '今日のタスク';

  @override
  String get donateCommunityLabel => 'コミュニティ';

  @override
  String get donateDayStreakLabel => '連続日数';

  @override
  String get donateHabitHintTitle => '習慣とは？';

  @override
  String get donateHabitHintBody =>
      '習慣とは、具体的で繰り返し行える行動のことで、単なる大まかな目標ではありません。良い説明には、行動そのものに加えて、いつ・どこで行うか、そして時にはなぜ行うかという文脈も含まれます。';

  @override
  String get donateHabitHintExampleIntro => '例：';

  @override
  String get donateHabitHintExampleSentence =>
      '[T]朝食後[/T]、[R]もっと元気になりたいので[/R][L]公園で[/L][B]20分間散歩します[/B]。';

  @override
  String get donateFormDescribeHabitLabel => 'あなたの習慣を教えてください';

  @override
  String get donateFormHabitHint => '例：毎朝30分散歩する';

  @override
  String get donateFormHabitValidationError => '習慣を説明してください（10文字以上）';

  @override
  String get donateFormFrequencyQuestion => 'この習慣をどのくらいの頻度で行っていますか？';

  @override
  String get donateFormFrequencyRarely => 'たまに';

  @override
  String get donateFormFrequencyWeekly => '週1回';

  @override
  String get donateFormFrequencySeveralPerWeek => '週に数回';

  @override
  String get donateFormFrequencyDaily => '毎日';

  @override
  String get donateFormHealthBenefitQuestion =>
      'この習慣はあなたの健康にどれくらい役立っていると思いますか？';

  @override
  String get donateFormRatingCaption => '1 = まったく当てはまらない · 5 = 非常に当てはまる';

  @override
  String get donateFormWellbeingQuestion => 'この習慣はあなたの幸福感をどれくらい高めていると思いますか？';

  @override
  String get donateVoiceStartRecording => '代わりに話す';

  @override
  String get donateVoiceStopRecording => '録音を停止';

  @override
  String get donateVoiceTranscribing => '文字起こし中…';

  @override
  String get donateVoiceTranscriptionFailed =>
      '文字起こしできませんでした。もう一度お試しいただくか、入力してください。';

  @override
  String get donateVoiceMicPermissionDenied =>
      '習慣を話すにはマイクへのアクセスが必要です。代わりに入力することもできます。';

  @override
  String get donateVoiceHoldToSpeak => '押しながら話す';

  @override
  String get donateVoiceRecording => '録音中… 離すと停止します';

  @override
  String get donateVoiceEditTranscript => 'テキストを編集';

  @override
  String get donateVoiceTranscriptPlaceholder => '下のボタンを押しながら習慣を話してください';

  @override
  String get donateStructuredPickerLabel => '何をしましたか?';

  @override
  String get donateStructuredPickerHint => '最も当てはまる活動を選んでください';

  @override
  String get donateStructuredEmptyState => 'まだ利用できる活動がありません。後ほど再度お試しください。';

  @override
  String get setCueNextButton => '次へ';

  @override
  String get setCueNoneAvailableTitle => 'まだきっかけが登録されていません';

  @override
  String get setCueNoneAvailableSubtitle => '研究担当者がまもなくきっかけを設定します';

  @override
  String setCueAssignedNumbered(int index, int total) {
    return 'きっかけ $index/$total（研究により割り当て）';
  }

  @override
  String get setCueAssignedByStudy => '研究により割り当て';

  @override
  String addAnotherCueCount(int current, int max) {
    return 'きっかけを追加（$current/$max）';
  }

  @override
  String setCueMaxReachedNote(int max) {
    return 'きっかけは最大$max個まで追加できます。';
  }

  @override
  String get setCueLabelSingle => 'あなたのきっかけ';

  @override
  String setCueLabelNumbered(int number) {
    return 'きっかけ $number';
  }

  @override
  String get setCueRemoveTooltip => 'きっかけを削除';

  @override
  String get setCueExtraPlaceholder => '例：平日の自宅で';

  @override
  String couldNotLogToday(String error) {
    return '本日の記録を保存できませんでした：$error';
  }

  @override
  String couldNotLogDay(String error) {
    return '記録を更新できませんでした：$error';
  }

  @override
  String get continueButton => '次へ';

  @override
  String get describeYourHabitMinLength => '習慣を入力してください(3文字以上)';

  @override
  String get yourHabitLabel => 'あなたの習慣';

  @override
  String get yourHabitHint => '例:20分のウォーキング';

  @override
  String get nextButton => '次へ';

  @override
  String get helpAndSupport => 'ヘルプとサポート';

  @override
  String get contactResearchTeam => '研究チームに連絡する';

  @override
  String get contactResearchTeamDescription =>
      '質問や問題がありますか？メールを送っていただければ、折り返しご連絡します。';

  @override
  String get sendEmail => 'メールを送る';

  @override
  String couldNotOpenEmailApp(String email) {
    return 'メールアプリを開けませんでした。$email まで直接メールを送ってください。';
  }

  @override
  String get frequentlyAskedQuestions => 'よくある質問';

  @override
  String get faqPassphraseQuestion => '復元用パスフレーズを紛失しました。どうすればいいですか？';

  @override
  String get faqPassphraseAnswer =>
      '24単語のパスフレーズはアカウントを復元する唯一の方法です。まだお持ちの場合は、ウェルカム画面の「アカウントを復元」をご利用ください。紛失した場合、残念ながらアカウントとデータは復元できません。最初からやり直したい場合はお問い合わせください。';

  @override
  String get faqDataQuestion => 'データのエクスポートや削除はできますか？';

  @override
  String get faqDataAnswer =>
      'はい。設定 → マイデータをエクスポート で、アカウントに紐づくすべてのデータをダウンロードできます。設定 → アカウントを削除 で完全に削除することもできます。削除は取り消せません。';

  @override
  String get faqOfflineQuestion => 'アプリ使用中に接続が切れたらどうなりますか？';

  @override
  String get faqOfflineAnswer =>
      'オフライン中に送信した習慣の記録は端末に保存され、オンラインに戻ると自動的に送信されます。';

  @override
  String get faqNotificationsQuestion => 'リマインダーをオフにできますか？';

  @override
  String get faqNotificationsAnswer =>
      'リマインダーは研究の一部であり、アプリ内でオフにすることはできません。必要な場合は、スマートフォンのシステム設定でこのアプリの通知を管理できます。';

  @override
  String get faqConsentQuestion => '同意を撤回できますか？';

  @override
  String get faqConsentAnswer =>
      'はい、いつでも可能です。設定 → 研究への同意 で同意内容を確認できます。設定 → アカウントを削除 で同意を撤回しデータを削除できます。';

  @override
  String get changeRecoveryPassphrase => '復元用パスフレーズを変更';

  @override
  String get rotatePassphraseTitle => '復元用パスフレーズを変更しますか？';

  @override
  String get rotatePassphraseWarning =>
      '現在の24単語のパスフレーズはすぐに使用できなくなります。新しいパスフレーズは必ず安全な場所に保存してください。';

  @override
  String get rotatePassphraseConfirm => '新しいパスフレーズを生成';

  @override
  String get rotatePassphraseNewTitle => '新しい復元用パスフレーズ';

  @override
  String get rotatePassphraseNewSubtitle =>
      'この24単語を書き留めるか、安全な場所に保存してください。アカウントの復元に必要です。';

  @override
  String get rotatePassphraseSavedCheckbox => '書き留めました';

  @override
  String get rotatePassphraseDone => '完了';

  @override
  String get rotatePassphraseFailed => '新しいパスフレーズを生成できませんでした。接続を確認して再試行してください。';

  @override
  String get copyToClipboard => 'クリップボードにコピー';

  @override
  String get passphraseCopied => 'パスフレーズをクリップボードにコピーしました';

  @override
  String get close => '閉じる';

  @override
  String appVersion(String version, String buildNumber) {
    return 'バージョン $version（$buildNumber）';
  }

  @override
  String get habitTypeBuild => 'Build a new habit';

  @override
  String get habitTypeQuit => 'Break a habit';

  @override
  String get habitTypeFilterAll => 'All';

  @override
  String get habitImpactFilterAll => 'All';

  @override
  String get habitImpactFilterHigh => 'High impact';

  @override
  String get habitImpactFilterLow => 'Low impact';

  @override
  String get exploreFiltersTooltip => 'Filters';

  @override
  String get exploreFiltersTitle => 'Filters';

  @override
  String get exploreFilterHabitTypeLabel => 'Habit Type';

  @override
  String get exploreFilterHealthBenefitLabel => 'Health Benefit';

  @override
  String get exploreFilterWellbeingLabel => 'Wellbeing';

  @override
  String get habitHealthBenefitFilterAll => 'All';

  @override
  String get habitHealthBenefitFilterHigh => 'High benefit';

  @override
  String get habitHealthBenefitFilterLow => 'Low benefit';

  @override
  String get habitWellbeingFilterAll => 'All';

  @override
  String get habitWellbeingFilterHigh => 'High wellbeing';

  @override
  String get habitWellbeingFilterLow => 'Low wellbeing';

  @override
  String get exploreFiltersClearAll => 'Clear all';

  @override
  String get exploreFiltersDone => 'Done';

  @override
  String get informationOverloadTitle => 'One habit at a time';

  @override
  String get informationOverloadInfo =>
      'To help habits stick, we ask you to focus on your current ones before adding new ones of the same type. New slots open up automatically as your habits become more automatic. Habit stacking isn\'t affected by this limit. You can turn this off in Settings, but we don\'t recommend it.';

  @override
  String get informationOverloadBlocked =>
      'Let\'s focus on your current habit first — a new slot opens once it becomes more automatic.';

  @override
  String get informationOverloadBlockedOptOutHint =>
      'You can turn this off in Settings.';

  @override
  String get informationOverloadBlockedOptOutAction => 'Go to Settings';

  @override
  String get stackOntoExistingHabitTitle => 'Stack onto an existing habit';

  @override
  String get stackOntoExistingHabitSubtitle =>
      'Anchor this new habit to one you already do';

  @override
  String get stackAnchorPickLabel => 'Anchor habit';

  @override
  String get stackAnchorNone => 'None';

  @override
  String get stackAnchorFreeTextLabel => 'Or type an anchor habit';

  @override
  String get stackAnchorFreeTextHint => 'e.g. After my morning coffee';

  @override
  String stackAlsoTrackAnchor(String anchor) {
    return '「$anchor」も習慣として記録する';
  }

  @override
  String stackedOntoLabel(String anchor) {
    return '積み重ね先: $anchor';
  }

  @override
  String get habitsSection => 'Habits';

  @override
  String get informationOverloadOptOutTitle => 'Allow multiple new habits';

  @override
  String get informationOverloadOptOutSubtitle =>
      'Turn off the one-habit-at-a-time focus guard';

  @override
  String get progressSection => 'Progress';

  @override
  String get achievementsTitle => 'Achievements';

  @override
  String get achievementsSubtitle =>
      'Badges you\'ve earned, and badges still to unlock.';

  @override
  String get achievementsLockedTag => 'Locked';
}
