#!/usr/bin/env python3
# Copyright 2026 The Chromium Authors. All rights reserved.
# Use of this source code is governed by a BSD-style license that can be
# found in the LICENSE file.

import os
import pathlib
import tempfile
import unittest
from unittest.mock import patch
from subprocess import CompletedProcess

from gen import DetectMsvcDepsPrefix, GenerateLastCommitPosition, Platform


class VendoredPositionTest(unittest.TestCase):
  def test_localized_msvc_dependency_prefix(self):
    def compiler(argv, **kwargs):
      header = pathlib.Path(argv[-1]).with_name('gn-deps-probe.h')
      message = 'Remarque\u00a0: inclusion du fichier\u00a0: '
      return CompletedProcess(argv, 0, b'',
                              (message + str(header) + '\n').encode('cp1252'))
    with tempfile.TemporaryDirectory() as directory:
      with patch('gen.locale.getencoding', return_value='cp1252'):
        with patch('gen.subprocess.run', side_effect=compiler):
          self.assertEqual(DetectMsvcDepsPrefix('cl.exe', directory),
                           'Remarque\u00a0: inclusion du fichier\u00a0:')

  def test_pinned_position_and_incremental_header(self):
    with tempfile.TemporaryDirectory() as directory:
      header = str(pathlib.Path(directory) / 'last_commit_position.h')
      with patch.dict(os.environ, {'GN_BUILD_LAST_COMMIT_POSITION':
                                  '2595 (0035961837fb)'}):
        GenerateLastCommitPosition(Platform('msvc'), header, False)
        self.assertIn('2595 (0035961837fb)', pathlib.Path(header).read_text())
        before = pathlib.Path(header).stat().st_mtime_ns
        GenerateLastCommitPosition(Platform('msvc'), header, False)
        self.assertEqual(before, pathlib.Path(header).stat().st_mtime_ns)
        GenerateLastCommitPosition(Platform('msvc'), header, True)
        self.assertIn('0 (UNKNOWN)', pathlib.Path(header).read_text())

  def test_invalid_position_rejected(self):
    with patch.dict(os.environ, {'GN_BUILD_LAST_COMMIT_POSITION': 'invalid'}):
      with self.assertRaises(ValueError):
        GenerateLastCommitPosition(Platform('msvc'), 'unused.h', False)


if __name__ == '__main__':
  unittest.main()
