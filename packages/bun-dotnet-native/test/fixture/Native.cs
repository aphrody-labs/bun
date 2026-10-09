using System.Runtime.InteropServices;

namespace Fixture;

public static class Native
{
    [UnmanagedCallersOnly]
    public static int Add(int a, int b) => a + b;

    [UnmanagedCallersOnly]
    public static double Scale(double x) => x * 2.5;

    public delegate int Unary(int x);

    public static int Square(int x) => x * x;
}
