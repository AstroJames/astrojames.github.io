"""Exact reconstruction identities. Run with Python and SymPy (not a runtime dependency)."""
import sympy as s
z=s.symbols('z', real=True)
a,b,q,d,e=s.symbols('a b q d e', real=True)
bb=[(3*q-4*b+a)/2,(d-b)/2,(-3*q+4*d-e)/2]
cc=[(q-2*b+a)/2,(b-2*q+d)/2,(q-2*d+e)/2]
polys=[q+B*z+C*(z*z-s.Rational(1,12)) for B,C in zip(bb,cc)]
for P, offsets, vals in zip(polys,[[-2,-1,0],[-1,0,1],[0,1,2]],[[a,b,q],[b,q,d],[q,d,e]]):
 for off,val in zip(offsets,vals):
  assert s.simplify(s.integrate(P,(z,off-s.Rational(1,2),off+s.Rational(1,2)))-val)==0
betas=[s.Rational(13,12)*(a-2*b+q)**2+(a-4*b+3*q)**2/4,
 s.Rational(13,12)*(b-2*q+d)**2+(b-d)**2/4,
 s.Rational(13,12)*(q-2*d+e)**2+(3*q-4*d+e)**2/4]
for P,beta in zip(polys,betas):
 assert s.simplify(s.integrate(s.diff(P,z)**2+s.diff(P,z,2)**2,(z,-s.Rational(1,2),s.Rational(1,2)))-beta)==0
optimal=s.Rational(1,10)*polys[0]+s.Rational(6,10)*polys[1]+s.Rational(3,10)*polys[2]
for power in range(5):
 vals={v:s.integrate(z**power,(z,offset-s.Rational(1,2),offset+s.Rational(1,2))) for v,offset in zip([a,b,q,d,e],[-2,-1,0,1,2])}
 assert s.simplify(optimal.subs(z,s.Rational(1,2)).subs(vals)-s.Rational(1,2)**power)==0
print('Verified exactly: all candidate cell moments; Jiang–Shu derivative-integral indicators; optimal face values for degrees 0–4.')
print('Right-face candidate coefficients:', [s.expand(P.subs(z,s.Rational(1,2))) for P in polys])
coeff=[3*a/s.Integer(640)-29*b/s.Integer(480)+1067*q/s.Integer(960)-29*d/s.Integer(480)+3*e/s.Integer(640),
 5*a/s.Integer(48)-17*b/s.Integer(24)+17*d/s.Integer(24)-5*e/s.Integer(48),
 -a/s.Integer(16)+3*b/s.Integer(4)-11*q/s.Integer(8)+3*d/s.Integer(4)-e/s.Integer(16),
 -a/s.Integer(12)+b/s.Integer(6)-d/s.Integer(6)+e/s.Integer(12),
 a/s.Integer(24)-b/s.Integer(6)+q/s.Integer(4)-d/s.Integer(6)+e/s.Integer(24)]
quartic=sum(c*z**k for k,c in enumerate(coeff))
for offset,val in zip([-2,-1,0,1,2],[a,b,q,d,e]):
 assert s.simplify(s.integrate(quartic,(z,offset-s.Rational(1,2),offset+s.Rational(1,2)))-val)==0
print('Verified exactly: unlimited quartic matches all five input cell averages.')
theta,nu=s.symbols('theta nu',real=True)
face=(2*s.exp(-2*s.I*theta)-13*s.exp(-s.I*theta)+47+27*s.exp(s.I*theta)-3*s.exp(2*s.I*theta))/60
symbol=-(1-s.exp(-s.I*theta))*face
series=s.series(symbol,theta,0,8).removeO().expand()
assert series==-s.I*theta-theta**6/60+s.I*theta**7/140
amplification=s.series((1+nu*series)*(1+nu*s.conjugate(series)),theta,0,7).removeO().expand()
assert amplification==1+nu**2*theta**2-nu*theta**6/30
print('Verified exactly: Forward Euler can amplify smooth optimal-weight fifth-order advection modes.')
