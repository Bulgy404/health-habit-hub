// Local simulator-only capture entrypoint. Uses the current app's actual
// widgets, themes, routes, and localization with explicit fictional fixtures.
// It is copied to an isolated mobile checkout and is never a release target.
import 'dart:io';
import 'dart:convert';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:hhh/app.dart';
import 'package:hhh/core/dio_provider.dart';
import 'package:hhh/features/my_habits/my_habits_models.dart';
import 'package:hhh/features/my_habits/my_habits_provider.dart';
import 'package:hhh/features/questionnaire/questionnaire_service.dart';
import 'package:hhh/models/bubble_graph.dart';
import 'package:hhh/models/habit_stats.dart';
import 'package:hhh/providers/auth_provider.dart';
import 'package:hhh/providers/bubble_graph_provider.dart';
import 'package:hhh/providers/locale_provider.dart';
import 'package:hhh/providers/show_in_graph_provider.dart';
import 'package:hhh/providers/study_config_provider.dart';
import 'package:hhh/providers/theme_provider.dart';
import 'package:hhh/router/app_router.dart';
import 'package:hhh/screens/shell_screen.dart';
import 'package:hhh/services/auth_service.dart';
import 'package:hhh/services/push_notification_service.dart';

class CapturePush extends PushNotificationService {
  CapturePush(Ref ref) : super(dio: Dio(), ref: ref);
  @override
  Future<void> initialize({void Function(String)? onLocalNotificationTap, void Function(String)? onPermissionStatus}) async {
    // The production shell catches this and skips push initialization. Screens
    // are unchanged; simulator capture never needs notification permissions.
    throw StateError('Notifications are disabled in the capture entrypoint');
  }
}

class CaptureAuth extends AuthService {
  @override
  Future<bool> isLoggedIn() async => true;
  @override
  Future<String?> getAccessToken() async => null;
  @override
  Future<String?> getUserIdFromToken() async => 'fictional-store-example';
}

class CaptureLocale extends LocaleNotifier {
  @override
  Locale build() => const Locale('en');
  @override
  Future<bool> setLocale(Locale locale) async { state = locale; return true; }
}

class CaptureTheme extends ThemeModeNotifier {
  @override
  ThemeMode build() => ThemeMode.light;
}

const captureConfig = HabitConfig(
  cueCount: 'multi', cueSource: 'self_selected', behaviorOptions: [],
  srhiItems: [], onboardingEnabled: false,
);

final today = DateTime.now();
String day(DateTime value) => '${value.year}-${value.month.toString().padLeft(2,'0')}-${value.day.toString().padLeft(2,'0')}';

List<Intention> intentions(String lang) {
  final de = lang == 'de';
  return [
    Intention(id:'walk', behaviorKey:'walking', behaviorLabel:de?'Spazieren gehen':'Take a walk', durationMinutes:20,
      cues:[IntentionCue(text:de?'Nach dem Mittagessen':'After lunch',source:'self_selected')],
      intentionStatement:de?'Nach dem Mittagessen gehe ich 20 Minuten spazieren.':'After lunch, I will go for a 20-minute walk.',
      status:'active',createdAt:today.subtract(const Duration(days:56))),
    Intention(id:'water',behaviorKey:'water',behaviorLabel:de?'Ein Glas Wasser trinken':'Drink a glass of water',durationMinutes:1,
      cues:[IntentionCue(text:de?'Nach meinem Morgenkaffee':'After my morning coffee',source:'self_selected')],
      intentionStatement:de?'Nach meinem Morgenkaffee trinke ich ein Glas Wasser.':'After my morning coffee, I will drink a glass of water.',
      status:'active',createdAt:today.subtract(const Duration(days:42)),
      anchorLabel:de?'Morgenkaffee':'Morning coffee',creationMode:'stacked'),
    Intention(id:'reading',behaviorKey:'reading',behaviorLabel:de?'Vor dem Schlafen lesen':'Read before bed',durationMinutes:15,
      cues:[IntentionCue(text:de?'Wenn ich ins Bett gehe':'When I get into bed',source:'self_selected')],
      intentionStatement:de?'Wenn ich ins Bett gehe, lese ich 15 Minuten.':'When I get into bed, I will read for 15 minutes.',
      status:'active',createdAt:today.subtract(const Duration(days:35))),
  ];
}

List<DailyLog> logs(String id) => [
  for(var i=0;i<56;i++)
    if((i+(id=='water'?2:0))%7!=3 && i%11!=5)
      DailyLog(intentionId:id,date:day(today.subtract(Duration(days:i))),enacted:true,
        loggedAt:today.subtract(Duration(days:i)),inCueContext:CueContextAnswer.yes),
];

List<SrhiTrajectoryPoint> trajectory() => [
  for(var i=0;i<7;i++) SrhiTrajectoryPoint(weekNumber:i+1,score:[2.6,3.1,3.4,4.0,4.3,4.8,5.2][i],
    submittedAt:today.subtract(Duration(days:(6-i)*7)),autonomyScore:.24+i*.075),
  SrhiTrajectoryPoint(weekNumber:8,scheduledFor:today.add(const Duration(days:7))),
];

BubbleGraph graph(String lang) {
  final de=lang=='de';
  final definitions=[
    ['BEHAVIOR',de?'Verhalten':'Behavior',12], ['TIME',de?'Zeit':'Time',10],
    ['PHYSICAL_SETTING',de?'Ort':'Location',8], ['PRIOR_BEHAVIOR',de?'Vorheriges Verhalten':'Prior behavior',7],
    ['OTHER_PEOPLE',de?'Andere Personen':'Other people',5],
    ['INTERNAL_STATE',de?'Innerer Zustand':'Internal state',6], ['REASONING',de?'Begründung':'Reasoning',9],
  ];
  final examples=de?['Nach dem Mittagessen spazieren gehen','Nach dem Kaffee Wasser trinken','Vor dem Schlafen lesen','Mit einer Freundin Rad fahren','Morgens dehnen','Nach der Arbeit kochen','In der Pause nach draußen gehen','Abends das Handy weglegen','Nach dem Zähneputzen Zahnseide benutzen','Am Wochenende schwimmen','Nach dem Aufstehen lüften','Auf dem Heimweg zu Fuß gehen']:
    ['Walk after lunch','Drink water after coffee','Read before bed','Cycle with a friend','Stretch in the morning','Cook after work','Go outside during a break','Put the phone away in the evening','Floss after brushing','Swim at the weekend','Open the window after waking','Walk on the way home'];
  return BubbleGraph.fromJson({'dimensions':[
    for(final d in definitions) {'id':d[0],'label':d[1],'habitCount':d[2],'habits':[
      for(var i=0;i<(d[2] as int);i++) {'id':'${d[0]}-$i','label':examples[i%examples.length],
        'originalText':examples[i%examples.length],'language':lang,'habitType':'build',
        'annotationCounts':{'helpful':0,'iDoThis':0}},
    ]},
  ]});
}

Future<void> main() async {
  if(kReleaseMode) throw StateError('Capture entrypoint must never run in release mode');
  WidgetsFlutterBinding.ensureInitialized();
  await initializeDateFormatting();
  await const FlutterSecureStorage().write(key:'onboarding_complete',value:'true');
  final prefs=await SharedPreferences.getInstance();
  for(final key in ['habit_onboarding_seen_v1','cue_onboarding_seen_v1','dot_legend_onboarding_seen_v1','overload_guard_onboarding_seen_v1','donate_habit_onboarding_seen_v1']) {
    await prefs.setBool(key,true);
  }
  // Every API request terminates here, without network or participant data.
  final dio=Dio()..interceptors.add(InterceptorsWrapper(onRequest:(options,handler){
    dynamic data=<String,dynamic>{};
    if(options.path.contains('/surveys/')) data={'id':'example-survey','title':'Example','jsonSchema':{},'status':'active'};
    if(options.path.contains('/reminder-plans')) data={'plans':<dynamic>[]};
    if(options.path.endsWith('/questionnaires/due')) data=<dynamic>[];
    handler.resolve(Response(requestOptions:options,statusCode:200,data:data));
  }));
  final container=ProviderContainer(overrides:[
    dioProvider.overrideWithValue(dio),authDioProvider.overrideWithValue(dio),
    authServiceProvider.overrideWithValue(CaptureAuth()),
    pushNotificationServiceProvider.overrideWith((ref)=>CapturePush(ref)),
    userRolesProvider.overrideWith((ref)async=>[]),
    localeProvider.overrideWith(CaptureLocale.new),themeModeProvider.overrideWith(CaptureTheme.new),
    studyConfigProvider.overrideWith((ref)async=>null),
    habitConfigProvider.overrideWith((ref)async=>captureConfig),
    intentionsProvider.overrideWith((ref)async=>intentions(ref.watch(localeProvider).languageCode)),
    dueSrhiProvider.overrideWith((ref)async=>[]),
    intentionLogsProvider.overrideWith((ref,id)async=>logs(id)),
    srhiTrajectoryProvider.overrideWith((ref,id)async=>trajectory()),
    allHabitsActivityProvider.overrideWith((ref)async=>{
      for(var i=0;i<56;i++) DateTime(today.year,today.month,today.day-i):i%7==3?0:(i%3)+1,
    }),
    reminderFrequenciesProvider.overrideWith((ref)async=>{'walk':'weekly','water':'few_per_week','reading':'daily'}),
    bubbleGraphProvider.overrideWith((ref)async=>graph(ref.watch(localeProvider).languageCode)),
    myStatsProvider.overrideWith((ref)async=>const MyStats(total:0,byDimension:[],habits:[])),
    dueQuestionnairesProvider.overrideWith((ref)async=>[]),
    reconsentRequiredProvider.overrideWithValue((_)async=>false),
    habitReminderSyncProvider.overrideWithValue(()async{}),
  ]);
  runApp(UncontrolledProviderScope(container:container,child:const HhhApp()));
  WidgetsBinding.instance.addPostFrameCallback((_){container.read(routerProvider).go('/habits');});
  final server=await HttpServer.bind(InternetAddress.loopbackIPv4,9094);
  await for(final req in server){
    try {
      if(req.uri.path=='/route'){
        final lang=req.uri.queryParameters['lang']??'en';
        await container.read(localeProvider.notifier).setLocale(Locale(lang));
        container.read(routerProvider).go(req.uri.queryParameters['path']??'/habits');
        await Future<void>.delayed(const Duration(milliseconds:1800));
      }
      req.response.headers.contentType=ContentType.json;
      req.response.write(jsonEncode({'ok':true,'route':container.read(routerProvider).routeInformationProvider.value.uri.toString()}));
    }catch(e){req.response.statusCode=500;req.response.write(jsonEncode({'error':e.toString()}));}
    await req.response.close();
  }
}
