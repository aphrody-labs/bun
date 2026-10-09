// C ABI over Qt 6 for bun:ffi (Qt has no C API). Built on demand by
// qt-window-shim.ts with the system C++ compiler and pkg-config:
//   c++ -std=c++17 -shared -fPIC qt-window.shim.cpp $(pkg-config --cflags --libs Qt6Widgets)
//   c++ -std=c++17 -shared -fPIC -DBUN_QT_KIRIGAMI qt-window.shim.cpp \
//     $(pkg-config --cflags --libs Qt6Widgets Qt6Quick Qt6Qml)
//
// Both entry points own the calling thread until the window closes and return
// QApplication::exec()'s status. `on_created` is a bun:ffi JSCallback, called on
// the calling thread once the window is shown. `closed_by` receives
// 0 (window close button), 1 (timeout_ms elapsed) or 2 (Escape).

#include <QApplication>
#include <QKeyEvent>
#include <QLabel>
#include <QTimer>
#include <QtGlobal>

#ifdef BUN_QT_KIRIGAMI
#include <QQmlApplicationEngine>
#include <QQmlError>
#include <cstdio>
#include <QQuickWindow>
#include <QVariantMap>
#endif

#if defined(_WIN32)
#define BUN_EXPORT extern "C" __declspec(dllexport)
#else
#define BUN_EXPORT extern "C" __attribute__((visibility("default")))
#endif

typedef void (*bun_window_created_cb)(int width, int height);

namespace {

int qt_argc = 1;
char qt_arg0[] = "bun";
char* qt_argv[] = {qt_arg0, nullptr};

class EscapeLabel : public QLabel {
public:
    int closedBy = 0;
    using QLabel::QLabel;

protected:
    void keyPressEvent(QKeyEvent* event) override
    {
        if (event->key() == Qt::Key_Escape) {
            closedBy = 2;
            close();
            return;
        }
        QLabel::keyPressEvent(event);
    }
};

} // namespace

BUN_EXPORT const char* bun_qt_version()
{
    return qVersion();
}

BUN_EXPORT int bun_qt_window_run(const char* title, const char* body, int width, int height, int timeout_ms,
    bun_window_created_cb on_created, int* closed_by)
{
    QApplication app(qt_argc, qt_argv);
    EscapeLabel window(QString::fromUtf8(body));
    window.setWindowTitle(QString::fromUtf8(title));
    window.setWordWrap(true);
    window.setAlignment(Qt::AlignLeft | Qt::AlignTop);
    window.setContentsMargins(40, 40, 40, 40);
    window.resize(width, height);
    window.show();
    if (timeout_ms > 0) {
        QTimer::singleShot(timeout_ms, &window, [&window] {
            window.closedBy = 1;
            window.close();
        });
    }
    if (on_created)
        on_created(width, height);
    int status = app.exec();
    if (closed_by)
        *closed_by = window.closedBy;
    return status;
}

#ifdef BUN_QT_KIRIGAMI

static const char kKirigamiQml[] = R"QML(
import QtQuick
import QtQuick.Controls as Controls
import org.kde.kirigami as Kirigami

Kirigami.ApplicationWindow {
    id: root
    required property string bodyText
    property int closedBy: 0

    pageStack.initialPage: Kirigami.Page {
        title: root.title
        Controls.Label {
            anchors.fill: parent
            text: root.bodyText
            wrapMode: Text.Wrap
        }
    }

    Shortcut {
        sequence: "Escape"
        onActivated: {
            root.closedBy = 2
            root.close()
        }
    }
}
)QML";

// Returns -1 if the QML scene (org.kde.kirigami) failed to load.
BUN_EXPORT int bun_kirigami_window_run(const char* title, const char* body, int width, int height, int timeout_ms,
    bun_window_created_cb on_created, int* closed_by)
{
    QApplication app(qt_argc, qt_argv);
    QQmlApplicationEngine engine;
    engine.setInitialProperties(QVariantMap {
        { QStringLiteral("title"), QString::fromUtf8(title) },
        { QStringLiteral("bodyText"), QString::fromUtf8(body) },
        { QStringLiteral("width"), width },
        { QStringLiteral("height"), height },
        { QStringLiteral("visible"), true },
    });
    QObject::connect(&engine, &QQmlEngine::warnings, [](const QList<QQmlError>& errors) {
        for (const QQmlError& error : errors)
            std::fprintf(stderr, "%s\n", error.toString().toUtf8().constData());
    });
    engine.loadData(QByteArray(kKirigamiQml), QUrl(QStringLiteral("qrc:/bun-ffi/kde-window.qml")));
    if (engine.rootObjects().isEmpty())
        return -1;
    auto* window = qobject_cast<QQuickWindow*>(engine.rootObjects().first());
    if (!window) {
        std::fprintf(stderr, "root object is a %s, not a QQuickWindow\n",
            engine.rootObjects().first()->metaObject()->className());
        return -1;
    }
    if (timeout_ms > 0) {
        QTimer::singleShot(timeout_ms, window, [window] {
            window->setProperty("closedBy", 1);
            window->close();
        });
    }
    if (on_created)
        on_created(width, height);
    int status = app.exec();
    if (closed_by)
        *closed_by = window->property("closedBy").toInt();
    return status;
}

#endif
