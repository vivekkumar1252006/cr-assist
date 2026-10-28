import 'package:flutter/material.dart';

import '../../../core/models.dart';
import '../../../core/services.dart';
import '../../../core/theme.dart';
import '../../../widgets/common.dart';
import 'attendance_complaint_section.dart';

class AttendanceScreen extends StatefulWidget {
  const AttendanceScreen({super.key});

  @override
  State<AttendanceScreen> createState() => _AttendanceScreenState();
}

class _AttendanceData {
  _AttendanceData({required this.profile, required this.sessions});

  final StudentProfile profile;
  final List<Map<String, dynamic>> sessions;
}

class _AttendanceScreenState extends State<AttendanceScreen> {
  Future<_AttendanceData> _loadData() async {
    final profileRes = await api.get('/student/profile');
    final profile = StudentProfile(
      profileRes['profile'] as Map<String, dynamic>,
    );

    List<Map<String, dynamic>> sessions = [];
    try {
      final sessRes = await api.get(
        '/student/attendance',
        query: {'limit': 50},
      );
      final rawItems =
          sessRes['items'] ?? sessRes['rows'] ?? sessRes['data'] ?? [];
      final allSessions = (rawItems as List<dynamic>)
          .cast<Map<String, dynamic>>();

      sessions = allSessions
          .map((s) {
            final sid = asInt(s['sessionId'] ?? s['id']);
            return {
              'sessionId': sid,
              'subject': s['subject'] as String? ?? 'Class / Lecture',
              'startsAt': s['startsAt'] ?? s['starts_at'],
              'endsAt': s['endsAt'] ?? s['ends_at'],
              'status': s['status'] as String? ?? 'absent',
            };
          })
          .where((s) => asInt(s['sessionId']) > 0)
          .toList();
    } catch (_) {}

    return _AttendanceData(profile: profile, sessions: sessions);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 28,
              height: 28,
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(8),
              ),
              clipBehavior: Clip.antiAlias,
              padding: const EdgeInsets.all(3),
              child: Image.asset('assets/images/logo.png', fit: BoxFit.contain),
            ),
            const SizedBox(width: 10),
            const Text('Attendance'),
          ],
        ),
        actions: [],
      ),
      body: AsyncView<_AttendanceData>(
        load: _loadData,
        builder: (context, data, reload) {
          final p = data.profile;
          final qrData = p.enrollmentNumber.isNotEmpty
              ? p.enrollmentNumber
              : (p.studentId.isNotEmpty ? p.studentId : p.fullName);

          return RefreshIndicator(
            onRefresh: reload,
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
              children: [
                // 1. Student Identity QR Card (Top)
                Card(
                  elevation: 2,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(20),
                    side: BorderSide(
                      color: AppColors.teal.withValues(alpha: 0.3),
                      width: 1.5,
                    ),
                  ),
                  child: Padding(
                    padding: const EdgeInsets.all(18),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        // Card Header with Mint-Green Badge
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            const Row(
                              children: [
                                Icon(
                                  Icons.qr_code_2_rounded,
                                  color: AppColors.teal,
                                  size: 24,
                                ),
                                SizedBox(width: 8),
                                Text(
                                  'Student Identity QR',
                                  style: TextStyle(
                                    fontSize: 17,
                                    fontWeight: FontWeight.w700,
                                    color: AppColors.navy,
                                  ),
                                ),
                              ],
                            ),
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 10,
                                vertical: 4,
                              ),
                              decoration: BoxDecoration(
                                color: AppColors.tealLight,
                                borderRadius: BorderRadius.circular(12),
                              ),
                              child: const Text(
                                'ACTIVE ID',
                                style: TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w700,
                                  color: AppColors.teal,
                                  letterSpacing: 0.5,
                                ),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 16),

                        // Navy Blue QR Code Box
                        Container(
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(16),
                            border: Border.all(
                              color: AppColors.teal.withValues(alpha: 0.25),
                              width: 2,
                            ),
                            boxShadow: [
                              BoxShadow(
                                color: AppColors.navy.withValues(alpha: 0.05),
                                blurRadius: 10,
                                offset: const Offset(0, 4),
                              ),
                            ],
                          ),
                          child: CustomPaint(
                            size: const Size(180, 180),
                            painter: QrPainter(
                              data: qrData,
                              darkColor: AppColors.navy,
                            ),
                          ),
                        ),
                        const SizedBox(height: 16),

                        // Student Information Container
                        Container(
                          width: double.infinity,
                          padding: const EdgeInsets.symmetric(
                            horizontal: 14,
                            vertical: 10,
                          ),
                          decoration: BoxDecoration(
                            color: AppColors.tealLight.withValues(alpha: 0.5),
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(color: AppColors.tealLight),
                          ),
                          child: Column(
                            children: [
                              Text(
                                p.fullName,
                                style: const TextStyle(
                                  fontSize: 17,
                                  fontWeight: FontWeight.w700,
                                  color: AppColors.navy,
                                ),
                                textAlign: TextAlign.center,
                              ),
                              const SizedBox(height: 4),
                              Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 12,
                                  vertical: 3,
                                ),
                                decoration: BoxDecoration(
                                  color: AppColors.tealLight,
                                  borderRadius: BorderRadius.circular(20),
                                ),
                                child: Text(
                                  'Enrollment No: ${p.enrollmentNumber}',
                                  style: const TextStyle(
                                    fontSize: 12,
                                    fontWeight: FontWeight.w700,
                                    color: AppColors.teal,
                                  ),
                                ),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                '${p.courseName} · Semester ${p.semester} (Group ${p.group})',
                                style: const TextStyle(
                                  fontSize: 12,
                                  color: AppColors.muted,
                                ),
                                textAlign: TextAlign.center,
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 12),

                        // Subtitle / Scanning instructions
                        const Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(
                              Icons.sensors,
                              size: 15,
                              color: AppColors.teal,
                            ),
                            SizedBox(width: 6),
                            Flexible(
                              child: Text(
                                'Present this QR code to your faculty to record your attendance.',
                                style: TextStyle(
                                  fontSize: 12,
                                  color: AppColors.muted,
                                ),
                                textAlign: TextAlign.center,
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 16),

                // 2. Attendance Complaint section (form + submitted complaints)
                const SizedBox(height: 8),
                const AttendanceComplaintSection(),

                const SizedBox(height: 24),
              ],
            ),
          );
        },
      ),
    );
  }
}

/// CustomPainter to draw a crisp Navy-Blue QR code module grid
class QrPainter extends CustomPainter {
  QrPainter({
    required this.data,
    required this.darkColor,
    this.lightColor = Colors.white,
  }) : matrix = QrCodeGenerator.generate(data);

  final String data;
  final Color darkColor;
  final Color lightColor;
  final List<List<bool>> matrix;

  @override
  void paint(Canvas canvas, Size size) {
    final n = matrix.length;
    if (n == 0) return;

    final moduleSize = size.width / n;
    final darkPaint = Paint()..color = darkColor;
    final lightPaint = Paint()..color = lightColor;

    canvas.drawRect(Rect.fromLTWH(0, 0, size.width, size.height), lightPaint);

    for (int r = 0; r < n; r++) {
      for (int c = 0; c < n; c++) {
        if (matrix[r][c]) {
          final rect = Rect.fromLTWH(
            c * moduleSize,
            r * moduleSize,
            moduleSize + 0.4,
            moduleSize + 0.4,
          );
          canvas.drawRect(rect, darkPaint);
        }
      }
    }
  }

  @override
  bool shouldRepaint(covariant QrPainter oldDelegate) {
    return oldDelegate.data != data ||
        oldDelegate.darkColor != darkColor ||
        oldDelegate.lightColor != lightColor;
  }
}

/// Pure-Dart QR Code Matrix Generator
class QrCodeGenerator {
  static List<List<bool>> generate(String data) {
    if (data.isEmpty) data = 'UNKNOWN';
    final bytes = data.codeUnits;

    int version = 1;
    int maxData = 19;
    int numEc = 7;

    if (bytes.length > 19 && bytes.length <= 34) {
      version = 2;
      maxData = 34;
      numEc = 10;
    } else if (bytes.length > 34 && bytes.length <= 55) {
      version = 3;
      maxData = 55;
      numEc = 15;
    } else if (bytes.length > 55) {
      version = 4;
      maxData = 80;
      numEc = 20;
    }

    final size = 17 + 4 * version;

    final bitBuffer = <int>[];

    void addBits(int val, int len) {
      for (int i = len - 1; i >= 0; i--) {
        bitBuffer.add((val >> i) & 1);
      }
    }

    addBits(4, 4); // Byte mode
    addBits(bytes.length, 8); // Length
    for (final b in bytes) {
      addBits(b, 8);
    }

    int termLen = (maxData * 8) - bitBuffer.length;
    if (termLen > 4) termLen = 4;
    addBits(0, termLen);

    while (bitBuffer.length % 8 != 0) {
      bitBuffer.add(0);
    }

    final padBytes = [0xEC, 0x11];
    int padIdx = 0;
    while (bitBuffer.length < maxData * 8) {
      addBits(padBytes[padIdx % 2], 8);
      padIdx++;
    }

    final dataCodewords = <int>[];
    for (int i = 0; i < maxData * 8; i += 8) {
      int val = 0;
      for (int j = 0; j < 8; j++) {
        val = (val << 1) | bitBuffer[i + j];
      }
      dataCodewords.add(val);
    }

    final ecCodewords = _calculateEc(dataCodewords, numEc);
    final allCodewords = [...dataCodewords, ...ecCodewords];

    final allBits = <int>[];
    for (final cw in allCodewords) {
      for (int i = 7; i >= 0; i--) {
        allBits.add((cw >> i) & 1);
      }
    }

    final grid = List.generate(size, (_) => List.filled(size, false));
    final isSet = List.generate(size, (_) => List.filled(size, false));

    void placeFinder(int r, int c) {
      for (int dr = -1; dr <= 7; dr++) {
        for (int dc = -1; dc <= 7; dc++) {
          final nr = r + dr;
          final nc = c + dc;
          if (nr >= 0 && nr < size && nc >= 0 && nc < size) {
            isSet[nr][nc] = true;
            if (dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6) {
              grid[nr][nc] =
                  (dr == 0 ||
                  dr == 6 ||
                  dc == 0 ||
                  dc == 6 ||
                  (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4));
            } else {
              grid[nr][nc] = false;
            }
          }
        }
      }
    }

    placeFinder(0, 0);
    placeFinder(0, size - 7);
    placeFinder(size - 7, 0);

    if (version >= 2) {
      final pos = version == 2 ? 18 : (version == 3 ? 22 : 26);
      void placeAlign(int r, int c) {
        if (isSet[r][c]) return;
        for (int dr = -2; dr <= 2; dr++) {
          for (int dc = -2; dc <= 2; dc++) {
            isSet[r + dr][c + dc] = true;
            grid[r + dr][c + dc] =
                (dr.abs() == 2 || dc.abs() == 2 || (dr == 0 && dc == 0));
          }
        }
      }

      placeAlign(pos, pos);
    }

    for (int i = 8; i < size - 8; i++) {
      if (!isSet[6][i]) {
        isSet[6][i] = true;
        grid[6][i] = (i % 2 == 0);
      }
      if (!isSet[i][6]) {
        isSet[i][6] = true;
        grid[i][6] = (i % 2 == 0);
      }
    }

    isSet[size - 8][8] = true;
    grid[size - 8][8] = true;

    for (int i = 0; i < 9; i++) {
      if (i < size) {
        if (!isSet[8][i]) isSet[8][i] = true;
        if (!isSet[i][8]) isSet[i][8] = true;
      }
    }
    for (int i = 0; i < 8; i++) {
      if (!isSet[8][size - 1 - i]) isSet[8][size - 1 - i] = true;
      if (!isSet[size - 1 - i][8]) isSet[size - 1 - i][8] = true;
    }

    int bitIdx = 0;
    int dir = -1;
    int colIdx = size - 1;
    while (colIdx > 0) {
      if (colIdx == 6) colIdx--;
      for (
        int r = (dir == -1 ? size - 1 : 0);
        (dir == -1 ? r >= 0 : r < size);
        r += dir
      ) {
        for (int dc = 0; dc < 2; dc++) {
          final col = colIdx - dc;
          if (!isSet[r][col]) {
            final bit = bitIdx < allBits.length ? allBits[bitIdx++] : 0;
            final mask = (r + col) % 2 == 0;
            grid[r][col] = (bit ^ (mask ? 1 : 0)) == 1;
          }
        }
      }
      dir = -dir;
      colIdx -= 2;
    }

    final formatBits = _getFormatBits(1, 0);
    for (int i = 0; i < 15; i++) {
      final bit = ((formatBits >> i) & 1) == 1;
      if (i < 6) {
        grid[8][i] = bit;
      } else if (i == 6) {
        grid[8][7] = bit;
      } else if (i == 7) {
        grid[8][8] = bit;
      } else if (i == 8) {
        grid[7][8] = bit;
      } else {
        grid[14 - i][8] = bit;
      }

      if (i < 7) {
        grid[size - 1 - i][8] = bit;
      } else {
        grid[8][size - 15 + i] = bit;
      }
    }

    return grid;
  }

  static List<int> _calculateEc(List<int> data, int numEc) {
    final exp = List<int>.filled(256, 0);
    final log = List<int>.filled(256, 0);
    int x = 1;
    for (int i = 0; i < 255; i++) {
      exp[i] = x;
      log[x] = i;
      x <<= 1;
      if (x & 0x100 != 0) x ^= 0x11D;
    }
    exp[255] = exp[0];

    int gfMul(int a, int b) {
      if (a == 0 || b == 0) return 0;
      return exp[(log[a] + log[b]) % 255];
    }

    List<int> poly = [1];
    for (int i = 0; i < numEc; i++) {
      final next = List<int>.filled(poly.length + 1, 0);
      for (int j = 0; j < poly.length; j++) {
        next[j] ^= gfMul(poly[j], exp[i]);
        next[j + 1] ^= poly[j];
      }
      poly = next;
    }

    final res = List<int>.from(data)..addAll(List<int>.filled(numEc, 0));
    for (int i = 0; i < data.length; i++) {
      final coef = res[i];
      if (coef != 0) {
        for (int j = 0; j < poly.length; j++) {
          res[i + j] ^= gfMul(poly[j], coef);
        }
      }
    }
    return res.sublist(data.length);
  }

  static int _getFormatBits(int ecLevel, int mask) {
    int data = (ecLevel << 3) | mask;
    int rem = data << 10;
    for (int i = 4; i >= 0; i--) {
      if ((rem & (1 << (i + 10))) != 0) {
        rem ^= (0x537 << i);
      }
    }
    return ((data << 10) | rem) ^ 0x5412;
  }
}
